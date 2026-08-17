const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const sqlConfig = {
  user: process.env.IMPORTS_SQL_USER || process.env.SQL_USER,
  password: process.env.IMPORTS_SQL_PASSWORD || process.env.SQL_PASSWORD,
  server: process.env.IMPORTS_SQL_SERVER || process.env.SQL_SERVER,
  port: parseInt(process.env.IMPORTS_SQL_PORT || process.env.SQL_PORT || '1433'),
  database: process.env.IMPORTS_SQL_DATABASE || process.env.SQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectTimeout: 30000,
    requestTimeout: 30000
  }
};

const BUBBLE_BASE = 'https://fidfunddev.site/api/1.1/';
const BUBBLE_TOKEN = process.env.BUBBLE_TOKEN_PROD;

if (!BUBBLE_TOKEN) {
  console.error('BUBBLE_TOKEN_PROD is not set in environment.');
  process.exit(1);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const statsPath = path.join(__dirname, 'stats_audits.prod.json');
  if (!fs.existsSync(statsPath)) {
    console.error('stats_audits.prod.json not found.');
    process.exit(1);
  }

  const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  const mismatchedIds = stats.discrepancy_ids?.['Field mismatch'] || [];
  console.log(`Found ${mismatchedIds.length} field-mismatched IDs in stats file.`);

  if (mismatchedIds.length === 0) {
    console.log('No mismatched IDs to sync. Exiting.');
    process.exit(0);
  }

  console.log('Connecting to SQL database...');
  const pool = await sql.connect(sqlConfig);

  const batchSize = 200;
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < mismatchedIds.length; i += batchSize) {
    // Check for stop file
    if (fs.existsSync('stop_sync.txt')) {
      console.log('Stop file stop_sync.txt detected. Gracefully stopping sync.');
      break;
    }

    const chunk = mismatchedIds.slice(i, i + batchSize);
    console.log(`\n--- Processing batch ${Math.floor(i / batchSize) + 1} (${i + 1} to ${Math.min(i + batchSize, mismatchedIds.length)} of ${mismatchedIds.length}) ---`);

    const idList = chunk.map(id => `'${id}'`).join(',');
    const query = `
      SELECT 
        Id,
        FirmNo,
        IsQualified,
        Year,
        AuditTypeLkp,
        IsAprroved,
        AuditorId,
        Frwk_InactiveFlag,
        Frwk_LastUpdatedTimestamp,
        Frwk_CreatedTimestamp,
        DueDate,
        ReceivedDate,
        ApprovedDate,
        PeriodStartDate,
        PeriodEnddate,
        AuditReportId,
        AuditFeesAmount,
        GrossInterestAmount,
        NetInterestAmount,
        BankChargesAmount,
        AuditComplianceStatusLkp
      FROM dbo.Aff_FirmFinancialYears
      WHERE Id IN (${idList})
    `;

    const res = await pool.request().query(query);
    const sqlRecords = res.recordset;
    
    console.log(`Fetched ${sqlRecords.length} records from SQL.`);

    // Loop through the fetched SQL records and sync sequentially
    for (const rec of sqlRecords) {
      if (fs.existsSync('stop_sync.txt')) {
        console.log('Stop file stop_sync.txt detected inside batch. Stopping.');
        break;
      }

      const payload = {
        id: rec.Id !== null ? String(rec.Id) : null,
        firm_no: rec.FirmNo !== null ? String(rec.FirmNo) : null,
        due_date: rec.DueDate ? rec.DueDate.toISOString() : null,
        received_date: rec.ReceivedDate ? rec.ReceivedDate.toISOString() : null,
        qualified: rec.IsQualified ? "yes" : "no",
        year: rec.Year !== null ? String(rec.Year) : null,
        audit_type: "YEAREND",
        approved: rec.IsAprroved ? "yes" : "no",
        approved_date: rec.ApprovedDate ? rec.ApprovedDate.toISOString() : null,
        approved_by: null,
        financial_year_start: rec.PeriodStartDate ? rec.PeriodStartDate.toISOString() : null,
        financial_year_end: rec.PeriodEnddate ? rec.PeriodEnddate.toISOString() : null,
        audit_report_number: rec.AuditReportId || null,
        audit_fees_amount: rec.AuditFeesAmount !== null ? Number(rec.AuditFeesAmount) : null,
        actual_audit_fees: null,
        gross_interest_amount: rec.GrossInterestAmount !== null ? Number(rec.GrossInterestAmount) : null,
        net_interest_amount: rec.NetInterestAmount !== null ? Number(rec.NetInterestAmount) : null,
        bank_charge_amount: rec.BankChargesAmount !== null ? Number(rec.BankChargesAmount) : null,
        auditor: rec.AuditorId !== null ? String(rec.AuditorId) : null,
        discriminator: "Aff.FirmFY",
        inactive_flag: rec.Frwk_InactiveFlag === true || rec.Frwk_InactiveFlag === 1 ? "true" : "false",
        last_updated: (rec.Frwk_LastUpdatedTimestamp || rec.Frwk_CreatedTimestamp || new Date()).toISOString(),
        audit_compliance_status: rec.AuditComplianceStatusLkp !== null ? String(rec.AuditComplianceStatusLkp) : null,
        external_id: rec.Id !== null ? String(rec.Id) : null
      };

      try {
        const response = await fetch(`${BUBBLE_BASE}wf/get_audits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${BUBBLE_TOKEN}`
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          successCount++;
        } else {
          const text = await response.text();
          console.error(`Failed to sync ID ${rec.Id}: HTTP ${response.status} - ${text}`);
          failCount++;
        }
      } catch (err) {
        console.error(`Network error syncing ID ${rec.Id}: ${err.message}`);
        failCount++;
      }

      // Safe pacing: 150ms delay between records
      await delay(150);
    }

    const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
    console.log(`Progress: ${successCount} successful, ${failCount} failed. Elapsed: ${elapsedMin} min.`);
  }

  await pool.close();
  console.log(`\n=== Audits Mismatch Sync Complete ===`);
  console.log(`Total Mismatch IDs: ${mismatchedIds.length}`);
  console.log(`Success Count: ${successCount}`);
  console.log(`Fail Count: ${failCount}`);
}

main().catch(async err => {
  console.error('Fatal execution error:', err);
});
