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
  'login.html',
  'package.json',
  'package-lock.json',
  'users_config.json'
];

async function runDeployment() {
  console.log('📦 Starting deployment package build...');
  const zip = new AdmZip();

  let addedFilesCount = 0;
  for (const filename of filesToDeploy) {
    const filePath = path.join(__dirname, filename);
    if (fs.existsSync(filePath)) {
      zip.addLocalFile(filePath);
      console.log(`  + Added file: ${filename}`);
      addedFilesCount++;
    } else {
      if (filename === 'users_config.json') {
        console.warn(`  ⚠️  Warning: users_config.json not found locally. Proceeding without user credentials.`);
      } else {
        console.warn(`  ⚠️  Warning: File not found: ${filename}`);
      }
    }
  }

  // Package the entire node_modules directory to eliminate missing dependency risks
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    console.log('  + Packaging entire node_modules directory...');
    zip.addLocalFolder(nodeModulesPath, 'node_modules');
  } else {
    console.warn('  ⚠️  Warning: node_modules folder not found!');
  }

  const zipBuffer = zip.toBuffer();
  console.log(`\n📦 Created package. Size: ${Math.round(zipBuffer.length / 1024)} KB (${(zipBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);
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
