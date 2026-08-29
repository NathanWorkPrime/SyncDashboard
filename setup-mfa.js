const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const CONFIG_PATH = path.join(__dirname, 'users_config.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (resolve_val) => {
      resolve(resolve_val.trim());
    });
  });
}

async function run() {
  console.log('🔒 --- SyncDash MFA Enrollment Tool --- 🔒\n');
  
  const username = await prompt('Enter Username: ');
  if (!username) {
    console.error('❌ Username cannot be empty.');
    rl.close();
    return;
  }

  const password = await prompt('Enter Password: ');
  if (!password || password.length < 6) {
    console.error('❌ Password must be at least 6 characters.');
    rl.close();
    return;
  }

  console.log('\n⌛ Generating secure credentials...');

  // Hash password
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  // Generate TOTP Secret
  const secret = speakeasy.generateSecret({
    name: `SyncDash:${username}`,
    issuer: 'SyncDash'
  });

  const totpSecret = secret.base32;
  const otpauthUrl = secret.otpauth_url;

  // Load existing configuration
  let usersConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      usersConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.warn('⚠️ Warning: Failed to parse existing users_config.json, resetting.');
    }
  }

  // Update user
  usersConfig[username.toLowerCase()] = {
    passwordHash,
    totpSecret
  };

  // Write config
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(usersConfig, null, 2), 'utf8');
  console.log(`\n✅ Saved user credentials for "${username}" to users_config.json`);

  // Generate terminal QR code
  try {
    const terminalQR = await qrcode.toString(otpauthUrl, { type: 'terminal', small: true });
    console.log('\n--- Scan this QR code in your Authenticator App (Google Authenticator, Authy, etc.) ---');
    console.log(terminalQR);
  } catch (err) {
    console.log('⚠️ Could not print QR code to terminal: ' + err.message);
  }

  console.log(`Manual Key (if QR code fails to scan): ${totpSecret}`);

  // Generate local HTML helper for visual convenience
  try {
    const dataUrl = await qrcode.toDataURL(otpauthUrl);
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>SyncDash MFA Enrollment</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #0f172a; color: #f8fafc; margin: 0; }
    .card { background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); text-align: center; max-width: 400px; width: 90%; }
    h2 { margin-top: 0; color: #a78bfa; }
    img { background: white; padding: 10px; border-radius: 8px; margin: 20px 0; }
    .secret { font-family: monospace; background: #334155; padding: 8px 12px; border-radius: 6px; font-size: 14px; word-break: break-all; margin: 10px 0; }
    .note { font-size: 12px; color: #94a3b8; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>SyncDash MFA Activation</h2>
    <p>Scan this QR code with Google Authenticator or any TOTP app for user <strong>${username}</strong>.</p>
    <img src="${dataUrl}" alt="MFA QR Code" width="200" height="200" />
    <div>Manual Code:</div>
    <div class="secret">${totpSecret}</div>
    <div class="note">⚠️ Please close this page and delete this file (<code>qrcode_enroll.html</code>) once you scan the code successfully.</div>
  </div>
</body>
</html>
    `;
    const htmlPath = path.join(__dirname, 'qrcode_enroll.html');
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`\n🖼️  A visual enrollment file was generated at: file:///${htmlPath.replace(/\\/g, '/')}`);
    console.log('   Open this file in a browser on your PC to scan it, then delete it afterwards.');
  } catch (err) {
    console.error('⚠️ Failed to generate helper HTML: ' + err.message);
  }

  rl.close();
}

run();
