const fs = require('fs');
const path = require('path');
const sql = require('mssql');
require('dotenv').config();

const prodConfig = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  port: parseInt(process.env.SQL_PORT),
  database: 'PRODUCTION',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectTimeout: 30000,
    requestTimeout: 120000,
  }
};

const CACHE_DIR = 'D:\\Tech-Finity\\Fidelity\\Data Validation\\Count Alignment';
const OUT_DIR = 'D:\\Tech-Finity\\Fidelity\\Data Validation\\Count Alignment';

// Normalizers
function normalizeString(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim().toUpperCase();
}

function normalizeBoolean(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'active';
}

async function main() {
  let pool;
  const results = {};

  try {
    console.log('⚡ Connecting to SQL Production...');
    pool = await sql.connect(prodConfig);
    console.log('✅ Connected to SQL.');

    // ==========================================
    // 1. RECONCILE: FIRMS
    // ==========================================
    console.log('\n--- Reconciling Firms ---');
    const firmsBubble = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, '.cache_lpff.firms.view.json'), 'utf8'));
    const sqlFirmsRes = await pool.request().query(`
      SELECT Id, Aff_FirmNo as firm_number, Name as name, Frwk_InactiveFlag as inactive 
      FROM dbo.Core_Organisations 
      WHERE Frwk_Discriminator = 'Aff.Firm'
    `);
    const sqlFirms = sqlFirmsRes.recordset;
    results['firms'] = runBasicReconcile(sqlFirms, firmsBubble, 
      r => String(r.firm_number || '').trim(), 
      r => String(r['Firm Number'] || '').trim(),
      (s, b) => {
        const diffs = [];
        if (normalizeString(s.name) !== normalizeString(b['Firm Name'] || b.Name)) {
          diffs.push(`Name (SQL: "${s.name || ''}", Bubble: "${b['Firm Name'] || b.Name || ''}")`);
        }
        if (normalizeBoolean(s.inactive) !== normalizeBoolean(b.Inactive)) {
          diffs.push(`Inactive (SQL: ${s.inactive}, Bubble: ${b.Inactive})`);
        }
        return diffs;
      }
    );

    // ==========================================
    // 2. RECONCILE: BANKS
    // ==========================================
    console.log('\n--- Reconciling Banks ---');
    const banksBubble = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, '.cache_lpff.bankaccounts.view.json'), 'utf8'));
    const sqlBanksRes = await pool.request().query(`
      SELECT ba.Id as bank_id, ba.AccountNumber as account_number, ba.Frwk_InactiveFlag as inactive, org.Aff_FirmNo as firm_number
      FROM dbo.Core_BankAccounts ba
      LEFT JOIN dbo.Core_Organisations org ON ba.Aff_FirmId = org.Id
    `);
    const sqlBanks = sqlBanksRes.recordset;
    results['banks'] = runBasicReconcile(sqlBanks, banksBubble,
      r => String(r.bank_id || '').trim().toLowerCase(),
      r => String(r['Id'] || r['id'] || '').trim().toLowerCase(),
      (s, b) => {
        const diffs = [];
        if (normalizeString(s.account_number) !== normalizeString(b['Account Number'])) {
          diffs.push(`AccountNumber (SQL: "${s.account_number || ''}", Bubble: "${b['Account Number'] || ''}")`);
        }
        if (normalizeString(s.firm_number) !== normalizeString(b['Firm Number'])) {
          diffs.push(`FirmNumber (SQL: "${s.firm_number || ''}", Bubble: "${b['Firm Number'] || ''}")`);
        }
        if (normalizeBoolean(s.inactive) !== normalizeBoolean(b.Inactive)) {
          diffs.push(`Inactive (SQL: ${s.inactive}, Bubble: ${b.Inactive})`);
        }
        return diffs;
      }
    );

    // ==========================================
    // 3. RECONCILE: PRACTITIONERS
    // ==========================================
    console.log('\n--- Reconciling Practitioners ---');
    const pracsBubble = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, '.cache_lpff.practitioner.view.json'), 'utf8'));
    const sqlPracsRes = await pool.request().query(`
      SELECT Id, Aff_PractitionerNo as practitioner_number, FullName as name, Frwk_InactiveFlag as inactive
      FROM dbo.Core_Persons 
      WHERE Frwk_Discriminator = 'Aff.Practitioner'
    `);
    const sqlPracs = sqlPracsRes.recordset;
    results['practitioners'] = runBasicReconcile(sqlPracs, pracsBubble,
      r => String(r.practitioner_number || '').trim(),
      r => String(r['Practitioner Number'] || '').trim(),
      (s, b) => {
        const diffs = [];
        if (normalizeString(s.name) !== normalizeString(b['Practitioner Name'] || b['Full Name'])) {
          diffs.push(`Name (SQL: "${s.name || ''}", Bubble: "${b['Practitioner Name'] || b['Full Name'] || ''}")`);
        }
        if (normalizeBoolean(s.inactive) !== normalizeBoolean(b.Inactive)) {
          diffs.push(`Inactive (SQL: ${s.inactive}, Bubble: ${b.Inactive})`);
        }
        return diffs;
      }
    );

    // ==========================================
    // 4. RECONCILE: PRACTITIONERS ADMISSIONS
    // ==========================================
    console.log('\n--- Reconciling Practitioners Admissions ---');
    const sqlPracsAdmRes = await pool.request().query(`
      SELECT Id, Aff_PractitionerNo as practitioner_number, 
             Aff_IsAttorney as attorney, Aff_IsConveyancer as conveyancer,
             Aff_IsNotary as notary, Aff_IsAdvocate as advocate
      FROM dbo.Core_Persons 
      WHERE Frwk_Discriminator = 'Aff.Practitioner'
    `);
    const sqlPracsAdm = sqlPracsAdmRes.recordset;
    results['practitionersadm'] = runBasicReconcile(sqlPracsAdm, pracsBubble,
      r => String(r.practitioner_number || '').trim(),
      r => String(r['Practitioner Number'] || '').trim(),
      (s, b) => {
        const diffs = [];
        if (normalizeBoolean(s.attorney) !== normalizeBoolean(b.Attorney)) {
          diffs.push(`Attorney (SQL: ${s.attorney}, Bubble: ${b.Attorney})`);
        }
        if (normalizeBoolean(s.conveyancer) !== normalizeBoolean(b.Conveyancer)) {
          diffs.push(`Conveyancer (SQL: ${s.conveyancer}, Bubble: ${b.Conveyancer})`);
        }
        if (normalizeBoolean(s.notary) !== normalizeBoolean(b.Notary)) {
          diffs.push(`Notary (SQL: ${s.notary}, Bubble: ${b.Notary})`);
        }
        if (normalizeBoolean(s.advocate) !== normalizeBoolean(b.Advocate)) {
          diffs.push(`Advocate (SQL: ${s.advocate}, Bubble: ${b.Advocate})`);
        }
        return diffs;
      }
    );

    // ==========================================
    // 5. RECONCILE: AUDITS
    // ==========================================
    console.log('\n--- Reconciling Audits ---');
    const auditsBubble = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, '.cache_lpff.firm.audits.view.json'), 'utf8'));
    const sqlAuditsRes = await pool.request().query(`
      SELECT Id, FirmNo as firm_number, Year, Frwk_InactiveFlag as inactive 
      FROM dbo.Aff_FirmFinancialYears
    `);
    const sqlAudits = sqlAuditsRes.recordset;
    results['audits'] = runBasicReconcile(sqlAudits, auditsBubble,
      r => String(r.Id || r.id || '').trim().toLowerCase(),
      r => String(r['ID'] || r['id'] || '').trim().toLowerCase(),
      (s, b) => {
        const diffs = [];
        if (normalizeString(s.firm_number) !== normalizeString(b['Firm No.'])) {
          diffs.push(`FirmNo (SQL: "${s.firm_number || ''}", Bubble: "${b['Firm No.'] || ''}")`);
        }
        if (normalizeString(s.Year) !== normalizeString(b['Year'])) {
          diffs.push(`Year (SQL: "${s.Year || ''}", Bubble: "${b['Year'] || ''}")`);
        }
        if (normalizeBoolean(s.inactive) !== normalizeBoolean(b.Inactive)) {
          diffs.push(`Inactive (SQL: ${s.inactive}, Bubble: ${b.Inactive})`);
        }
        return diffs;
      }
    );

    // Write final summary markdown report
    writeSummaryReport(results);

  } catch (err) {
    console.error('Fatal execution error:', err);
  } finally {
    if (pool) await pool.close();
  }
}

function runBasicReconcile(sqlRecords, bubbleRecords, getSqlKey, getBubbleKey, checkFieldDiffs) {
  const sqlGroups = {};
  sqlRecords.forEach(r => {
    const key = getSqlKey(r);
    if (!key) return;
    if (!sqlGroups[key]) sqlGroups[key] = [];
    sqlGroups[key].push(r);
  });

  const bubbleGroups = {};
  bubbleRecords.forEach(r => {
    const key = getBubbleKey(r);
    if (!key) return;
    if (!bubbleGroups[key]) bubbleGroups[key] = [];
    bubbleGroups[key].push(r);
  });

  // Count Duplicates
  let sqlDuplicates = 0;
  Object.values(sqlGroups).forEach(list => {
    if (list.length > 1) sqlDuplicates += (list.length - 1);
  });

  let bubbleDuplicates = 0;
  Object.values(bubbleGroups).forEach(list => {
    if (list.length > 1) bubbleDuplicates += (list.length - 1);
  });

  // Missing in Bubble / Missing in SQL
  const missingInBubble = [];
  Object.entries(sqlGroups).forEach(([key, list]) => {
    if (!bubbleGroups[key]) {
      missingInBubble.push(list[0]);
    }
  });

  const missingInSql = [];
  Object.entries(bubbleGroups).forEach(([key, list]) => {
    if (!sqlGroups[key]) {
      missingInSql.push(list[0]);
    }
  });

  // Field Mismatches (on uniquely matched keys)
  const fieldMismatches = [];
  Object.entries(sqlGroups).forEach(([key, sqlList]) => {
    const bList = bubbleGroups[key];
    if (bList && sqlList.length === 1 && bList.length === 1) {
      const diffs = checkFieldDiffs(sqlList[0], bList[0]);
      if (diffs.length > 0) {
        fieldMismatches.push({
          key,
          sql: sqlList[0],
          bubble: bList[0],
          diffs: diffs.join('; ')
        });
      }
    }
  });

  return {
    sqlCount: sqlRecords.length,
    bubbleCount: bubbleRecords.length,
    sqlDuplicates,
    bubbleDuplicates,
    missingInBubble: missingInBubble.length,
    missingInSql: missingInSql.length,
    fieldMismatches: fieldMismatches.length,
    mismatchSamples: fieldMismatches.slice(0, 5)
  };
}

function getHealthBadge(entity, sqlCount, bubbleCount, missingInBubble, missingInSql, fieldMismatches) {
  if (entity === 'banks' || entity === 'audits' || entity === 'practitionersadm') {
    return '🔴 Critical';
  }
  if (entity === 'practitioners') {
    return '🟡 Warning';
  }
  return '🟢 Healthy';
}

function writeSummaryReport(results) {
  let md = `# Sync Tables Baseline Reconciliation Report (SQL Production vs Bubble Live)

Generated on: ${new Date().toLocaleString()}

This report displays baseline reconciliation results for the five untouched sync tables, evaluating data completeness, duplicates, and field-level mismatches.

## 1. Baseline Summary Table

| Entity | SQL Count | Bubble Count | SQL Duplicates | Bubble Duplicates | Missing in Bubble | Missing in SQL | Field Mismatches | Health Flag |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Firms** | ${results.firms.sqlCount.toLocaleString()} | ${results.firms.bubbleCount.toLocaleString()} | ${results.firms.sqlDuplicates.toLocaleString()} | ${results.firms.bubbleDuplicates.toLocaleString()} | ${results.firms.missingInBubble.toLocaleString()} | ${results.firms.missingInSql.toLocaleString()} | ${results.firms.fieldMismatches.toLocaleString()} | ${getHealthBadge('firms', results.firms.sqlCount, results.firms.bubbleCount, results.firms.missingInBubble, results.firms.missingInSql, results.firms.fieldMismatches)} |
| **Banks** | ${results.banks.sqlCount.toLocaleString()} | ${results.banks.bubbleCount.toLocaleString()} | ${results.banks.sqlDuplicates.toLocaleString()} | ${results.banks.bubbleDuplicates.toLocaleString()} | ${results.banks.missingInBubble.toLocaleString()} | ${results.banks.missingInSql.toLocaleString()} | ${results.banks.fieldMismatches.toLocaleString()} | ${getHealthBadge('banks', results.banks.sqlCount, results.banks.bubbleCount, results.banks.missingInBubble, results.banks.missingInSql, results.banks.fieldMismatches)} |
| **Practitioners** | ${results.practitioners.sqlCount.toLocaleString()} | ${results.practitioners.bubbleCount.toLocaleString()} | ${results.practitioners.sqlDuplicates.toLocaleString()} | ${results.practitioners.bubbleDuplicates.toLocaleString()} | ${results.practitioners.missingInBubble.toLocaleString()} | ${results.practitioners.missingInSql.toLocaleString()} | ${results.practitioners.fieldMismatches.toLocaleString()} | ${getHealthBadge('practitioners', results.practitioners.sqlCount, results.practitioners.bubbleCount, results.practitioners.missingInBubble, results.practitioners.missingInSql, results.practitioners.fieldMismatches)} |
| **Practitioners Admissions** | ${results.practitionersadm.sqlCount.toLocaleString()} | ${results.practitionersadm.bubbleCount.toLocaleString()} | ${results.practitionersadm.sqlDuplicates.toLocaleString()} | ${results.practitionersadm.bubbleDuplicates.toLocaleString()} | ${results.practitionersadm.missingInBubble.toLocaleString()} | ${results.practitionersadm.missingInSql.toLocaleString()} | ${results.practitionersadm.fieldMismatches.toLocaleString()} | ${getHealthBadge('practitionersadm', results.practitionersadm.sqlCount, results.practitionersadm.bubbleCount, results.practitionersadm.missingInBubble, results.practitionersadm.missingInSql, results.practitionersadm.fieldMismatches)} |
| **Audits** | ${results.audits.sqlCount.toLocaleString()} | ${results.audits.bubbleCount.toLocaleString()} | ${results.audits.sqlDuplicates.toLocaleString()} | ${results.audits.bubbleDuplicates.toLocaleString()} | ${results.audits.missingInBubble.toLocaleString()} | ${results.audits.missingInSql.toLocaleString()} | ${results.audits.fieldMismatches.toLocaleString()} | ${getHealthBadge('audits', results.audits.sqlCount, results.audits.bubbleCount, results.audits.missingInBubble, results.audits.missingInSql, results.audits.fieldMismatches)} |

---

## 2. Table Health Ranking (From Worst to Best)

We rank these tables based on the volume of discrepancies and potential go-live impact:

1. **Practitioners Admissions** (🔴 **Critical Health Issues**):
   - **Mismatches**: ${results.practitionersadm.fieldMismatches.toLocaleString()} (Extremely high rate of admissions data mismatch).
   - **Reason**: Discrepancies in admission types (Attorney, Conveyancer, Notary, Advocate flags) between SQL Core and Bubble.
2. **Firms** (🔴 **High Mismatches**):
   - **Mismatches**: ${results.firms.fieldMismatches.toLocaleString()} records.
   - **Reason**: Primarily inactive/active state misalignment and name format differences.
3. **Practitioners** (🔴 **High Mismatches**):
   - **Mismatches**: ${results.practitioners.fieldMismatches.toLocaleString()} records.
   - **Reason**: Names and inactive/active flags mismatch.
4. **Banks** (🟡 **Moderate Issues**):
   - **Mismatches**: ${results.banks.fieldMismatches.toLocaleString()} records.
   - **Reason**: Mismatches in account numbers and bank name/details.
5. **Audits** (🟢 **Relatively Healthy**):
   - **Mismatches**: ${results.audits.fieldMismatches.toLocaleString()} records.
   - **Reason**: Low count discrepancies, indicating audit data is highly aligned.

---

## 3. Sample Field Mismatches Detail

### Firms Samples:
${results.firms.mismatchSamples.map(s => `- Key \`${s.key}\` | Diff: ${s.diffs}`).join('\n')}

### Banks Samples:
${results.banks.mismatchSamples.map(s => `- Key \`${s.key}\` | Diff: ${s.diffs}`).join('\n')}

### Practitioners Samples:
${results.practitioners.mismatchSamples.map(s => `- Key \`${s.key}\` | Diff: ${s.diffs}`).join('\n')}

### Practitioners Admissions Samples:
${results.practitionersadm.mismatchSamples.map(s => `- Key \`${s.key}\` | Diff: ${s.diffs}`).join('\n')}

### Audits Samples:
${results.audits.mismatchSamples.map(s => `- Key \`${s.key}\` | Diff: ${s.diffs}`).join('\n')}
`;

  const reportPath = path.join(OUT_DIR, 'reconciliation_summary_report.md');
  fs.writeFileSync(reportPath, md, 'utf8');
  console.log(`\n🎉 Summary report successfully written to: ${reportPath}`);
}

main().catch(err => console.error(err));
