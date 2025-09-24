const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { generateMobileConfig, generateWindowsInstaller, generateAndroidInstructions } = require('./lib/mobileconfig');

const app = express();
const PORT = process.env.PORT || 3000;
const COMPANY_WEBSITE = process.env.COMPANY_WEBSITE || 'https://www.unam.edu.na/';

// Database setup
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    certificate_trusted BOOLEAN DEFAULT 0,
    redirect_completed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS certificate_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    device_type TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
});

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'cert-portal-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 30 * 60 * 1000 } // 30 minutes
}));

// Multer setup for certificate uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'certificates/');
  },
  filename: (req, file, cb) => {
    cb(null, 'Fortinet_CA_SSL.cer');
  }
});
const upload = multer({ storage });

// Helper function to detect device type
function detectDeviceType(userAgent) {
  const ua = userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('windows')) return 'windows';
  return 'unknown';
}

// Routes
app.get('/', (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || '';
  const deviceType = detectDeviceType(userAgent);
  const redirectUrl = req.query.redirect || req.query.url;

  // Store redirect URL in session if provided
  if (redirectUrl) {
    req.session.redirectUrl = redirectUrl;
  }

  res.render('captive-portal', {
    deviceType,
    clientIp,
    redirectUrl: req.session.redirectUrl,
    companyWebsite: COMPANY_WEBSITE
  });
});

app.post('/accept-certificate', (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || '';
  const deviceType = detectDeviceType(userAgent);
  const username = req.body.username || `user_${Date.now()}`;

  console.log('Accept certificate request:', { clientIp, username, deviceType });

  // Create or update user record
  db.get('SELECT * FROM users WHERE ip_address = ? AND username = ?', [clientIp, username], (err, user) => {
    if (err) {
      console.error('Database error on SELECT:', err);
      return res.status(500).json({ error: 'Database error occurred: ' + err.message });
    }

    if (user) {
      // Update existing user
      db.run('UPDATE users SET certificate_trusted = 1 WHERE id = ?', [user.id], (err) => {
        if (err) {
          console.error('Database error on UPDATE:', err);
          return res.status(500).json({ error: 'Failed to update user: ' + err.message });
        }

        // Log the certificate acceptance
        db.run('INSERT INTO certificate_actions (user_id, action, device_type, ip_address) VALUES (?, ?, ?, ?)',
          [user.id, 'certificate_accepted', deviceType, clientIp]);

        req.session.userId = user.id;
        req.session.certificateAccepted = true;
        res.json({ success: true, userId: user.id });
      });
    } else {
      // Create new user
      console.log('Creating new user:', { username, clientIp, userAgent });
      db.run('INSERT INTO users (username, ip_address, user_agent, certificate_trusted) VALUES (?, ?, ?, ?)',
        [username, clientIp, userAgent, 1],
        function(err) {
          if (err) {
            console.error('Database error on INSERT:', err);
            return res.status(500).json({ error: 'Failed to create user: ' + err.message });
          }

          // Log the certificate acceptance
          db.run('INSERT INTO certificate_actions (user_id, action, device_type, ip_address) VALUES (?, ?, ?, ?)',
            [this.lastID, 'certificate_accepted', deviceType, clientIp]);

          req.session.userId = this.lastID;
          req.session.certificateAccepted = true;
          res.json({ success: true, userId: this.lastID });
        }
      );
    }
  });
});

app.get('/download-certificate', (req, res) => {
  const userId = req.session.userId;
  const deviceType = req.query.device || detectDeviceType(req.get('User-Agent') || '');
  const clientIp = req.ip || req.connection.remoteAddress;

  if (!userId) {
    return res.status(403).send('Access denied. Please accept the certificate first.');
  }

  // Log the download
  db.run('INSERT INTO certificate_actions (user_id, action, device_type, ip_address) VALUES (?, ?, ?, ?)',
    [userId, 'certificate_downloaded', deviceType, clientIp],
    (err) => {
      if (err) {
        console.error('Error logging download:', err);
      }
    }
  );

  // Send the certificate file
  const certPath = path.join(__dirname, 'certificates', 'Fortinet_CA_SSL.cer');
  if (fs.existsSync(certPath)) {
    res.download(certPath, 'Fortinet_CA_SSL.cer');
  } else {
    res.status(404).send('Certificate not found');
  }
});

// Seamless iOS/macOS installation via mobile configuration profile
app.get('/install-ios', (req, res) => {
  const userId = req.session.userId;
  const clientIp = req.ip || req.connection.remoteAddress;

  if (!userId) {
    return res.status(403).send('Access denied. Please accept the certificate first.');
  }

  try {
    const certPath = path.join(__dirname, 'certificates', 'Fortinet_CA_SSL.cer');
    if (!fs.existsSync(certPath)) {
      return res.status(404).send('Certificate not found');
    }

    // Generate mobile configuration profile
    const mobileConfig = generateMobileConfig(certPath, {
      displayName: 'UNAM Network Certificate',
      description: 'Required security certificate for University of Namibia network access',
      organization: 'University of Namibia',
      identifier: 'na.edu.unam.fortinet-ca'
    });

    // Log the installation attempt
    db.run('INSERT INTO certificate_actions (user_id, action, device_type, ip_address) VALUES (?, ?, ?, ?)',
      [userId, 'ios_profile_downloaded', 'ios', clientIp]);

    // Send as downloadable .mobileconfig file
    res.setHeader('Content-Type', 'application/x-apple-aspen-config');
    res.setHeader('Content-Disposition', 'attachment; filename="UNAM-Certificate.mobileconfig"');
    res.send(mobileConfig);

  } catch (error) {
    console.error('Error generating mobile config:', error);
    res.status(500).send('Error generating installation profile');
  }
});

// Seamless Windows installation via PowerShell script
app.get('/install-windows', (req, res) => {
  const userId = req.session.userId;
  const clientIp = req.ip || req.connection.remoteAddress;

  if (!userId) {
    return res.status(403).send('Access denied. Please accept the certificate first.');
  }

  try {
    const certPath = path.join(__dirname, 'certificates', 'Fortinet_CA_SSL.cer');
    if (!fs.existsSync(certPath)) {
      return res.status(404).send('Certificate not found');
    }

    // Generate PowerShell installer script
    const powershellScript = generateWindowsInstaller(certPath, {
      storeName: 'Root',
      storeLocation: 'LocalMachine'
    });

    // Log the installation attempt
    db.run('INSERT INTO certificate_actions (user_id, action, device_type, ip_address) VALUES (?, ?, ?, ?)',
      [userId, 'windows_script_downloaded', 'windows', clientIp]);

    // Send as downloadable PowerShell script
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="Install-UNAM-Certificate.ps1"');
    res.send(powershellScript);

  } catch (error) {
    console.error('Error generating Windows installer:', error);
    res.status(500).send('Error generating installation script');
  }
});

// Enhanced Android installation with auto-download
app.get('/install-android', (req, res) => {
  const userId = req.session.userId;
  const clientIp = req.ip || req.connection.remoteAddress;

  if (!userId) {
    return res.status(403).send('Access denied. Please accept the certificate first.');
  }

  // Generate Android-specific instructions and URLs
  const certificateUrl = `${req.protocol}://${req.get('Host')}/download-certificate?device=android`;
  const androidInstructions = generateAndroidInstructions(certificateUrl);

  // Log the installation attempt
  db.run('INSERT INTO certificate_actions (user_id, action, device_type, ip_address) VALUES (?, ?, ?, ?)',
    [userId, 'android_install_started', 'android', clientIp]);

  res.render('android-seamless', {
    userId,
    instructions: androidInstructions,
    certificateUrl,
    companyWebsite: COMPANY_WEBSITE
  });
});

// Auto-install endpoint - detects device and uses best method
app.get('/auto-install', (req, res) => {
  const userId = req.session.userId;
  const userAgent = req.get('User-Agent') || '';
  const deviceType = detectDeviceType(userAgent);

  if (!userId) {
    return res.status(403).send('Access denied. Please accept the certificate first.');
  }

  // Redirect to appropriate seamless installation method
  switch (deviceType) {
    case 'ios':
      res.redirect('/install-ios');
      break;
    case 'macos':
      res.redirect('/install-ios'); // iOS profile works for macOS too
      break;
    case 'android':
      res.redirect('/install-android');
      break;
    case 'windows':
      res.redirect('/install-windows');
      break;
    default:
      // Fall back to regular download for unknown devices
      res.redirect('/download-certificate?device=' + deviceType);
  }
});

app.get('/instructions/:os', (req, res) => {
  const os = req.params.os;
  const userId = req.session.userId;
  const validOS = ['windows', 'macos', 'ios', 'android'];

  if (!userId) {
    return res.redirect('/');
  }

  if (validOS.includes(os)) {
    res.render(`instructions/${os}`, {
      userId,
      companyWebsite: COMPANY_WEBSITE,
      redirectUrl: req.session.redirectUrl
    });
  } else {
    res.status(404).send('Instructions not found');
  }
});

// Route to handle certificate installation completion
app.post('/certificate-installed', (req, res) => {
  const userId = req.session.userId;
  const clientIp = req.ip || req.connection.remoteAddress;
  const deviceType = detectDeviceType(req.get('User-Agent') || '');

  if (!userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Log certificate installation completion
  db.run('INSERT INTO certificate_actions (user_id, action, device_type, ip_address) VALUES (?, ?, ?, ?)',
    [userId, 'certificate_installed', deviceType, clientIp]);

  // Mark redirect as ready
  db.run('UPDATE users SET redirect_completed = 1 WHERE id = ?', [userId]);

  const redirectUrl = req.session.redirectUrl || COMPANY_WEBSITE;
  res.json({ success: true, redirectUrl });
});

// Route to redirect to company website
app.get('/redirect', (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.redirect('/');
  }

  const redirectUrl = req.session.redirectUrl || COMPANY_WEBSITE;

  // Log the redirect
  db.run('INSERT INTO certificate_actions (user_id, action, device_type, ip_address) VALUES (?, ?, ?, ?)',
    [userId, 'redirected_to_company', 'web', req.ip || req.connection.remoteAddress]);

  // Clear session
  req.session.destroy();

  res.redirect(redirectUrl);
});

// Admin route to view statistics
app.get('/admin/stats', (req, res) => {
  db.all(`
    SELECT
      u.*,
      COUNT(ca.id) as total_actions,
      GROUP_CONCAT(DISTINCT ca.device_type) as devices,
      GROUP_CONCAT(DISTINCT ca.action) as actions
    FROM users u
    LEFT JOIN certificate_actions ca ON u.id = ca.user_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `, (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(users);
  });
});

// Admin route to view certificate actions
app.get('/admin/actions', (req, res) => {
  db.all(`
    SELECT
      ca.*,
      u.username,
      u.ip_address as user_ip
    FROM certificate_actions ca
    JOIN users u ON ca.user_id = u.id
    ORDER BY ca.timestamp DESC
    LIMIT 100
  `, (err, actions) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(actions);
  });
});

// Admin route to upload new certificate
app.post('/admin/upload-cert', upload.single('certificate'), (req, res) => {
  res.json({ success: true, message: 'Certificate uploaded successfully' });
});

app.listen(PORT, () => {
  console.log(`Certificate portal running on http://localhost:${PORT}`);
});