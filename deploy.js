require('dotenv').config();
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const DEPLOY_TOKEN = process.env.DEPLOY_TOKEN;
const DEPLOY_URL = process.env.DEPLOY_URL;

if (!DEPLOY_TOKEN || !DEPLOY_URL) {
  console.error('❌ Error: DEPLOY_TOKEN and DEPLOY_URL must be defined in your .env file.');
  process.exit(1);
}

// Files to package in the deployment zip
const filesToDeploy = [
  'server.js',
  'dashboard.html',
  'dashboard4.html',
  'package.json',
  'package-lock.json'
];

async function runDeployment() {
  console.log('📦 Starting deployment package build...');
  const zip = new AdmZip();

  let addedFilesCount = 0;
  for (const filename of filesToDeploy) {
    const filePath = path.join(__dirname, filename);
    if (fs.existsSync(filePath)) {
      zip.addLocalFile(filePath);
      console.log(`  + Added ${filename}`);
      addedFilesCount++;
    } else {
      console.warn(`  ⚠️  Warning: File not found: ${filename}`);
    }
  }

  if (addedFilesCount === 0) {
    console.error('❌ Error: No files were added to the deployment package.');
    process.exit(1);
  }

  const zipBuffer = zip.toBuffer();
  console.log(`📦 Created package of ${addedFilesCount} files. Size: ${Math.round(zipBuffer.length / 1024)} KB`);
  console.log(`🚀 Shipping package to ${DEPLOY_URL}...`);

  try {
    const res = await fetch(DEPLOY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEPLOY_TOKEN}`,
        'Content-Type': 'application/zip'
      },
      body: zipBuffer
    });

    const bodyText = await res.text();
    let responseData;
    try {
      responseData = JSON.parse(bodyText);
    } catch (e) {
      responseData = { message: bodyText };
    }

    if (res.ok) {
      console.log(`\n✅ Deployment successful! Server response:`);
      console.log(`   ${responseData.message || 'No message'}`);
    } else {
      console.error(`\n❌ Deployment failed (HTTP ${res.status}):`);
      console.error(`   ${responseData.error || bodyText}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Network error during deployment:`, err.message);
    process.exit(1);
  }
}

runDeployment();
