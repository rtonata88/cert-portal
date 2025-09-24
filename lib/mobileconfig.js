const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate iOS/macOS Mobile Configuration Profile (.mobileconfig)
 * This allows seamless certificate installation on Apple devices
 */
function generateMobileConfig(certificatePath, options = {}) {
    const {
        displayName = 'Fortinet CA SSL Certificate',
        description = 'Security certificate required for network access',
        organization = 'University of Namibia',
        identifier = 'na.edu.unam.fortinet-ca',
        version = 1
    } = options;

    // Read the certificate file
    const certData = fs.readFileSync(certificatePath);
    const certBase64 = certData.toString('base64');

    // Generate unique UUID for this profile
    const profileUUID = crypto.randomUUID().toUpperCase();
    const certUUID = crypto.randomUUID().toUpperCase();

    const mobileConfigXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadCertificateFileName</key>
            <string>Fortinet_CA_SSL.cer</string>
            <key>PayloadContent</key>
            <data>${certBase64}</data>
            <key>PayloadDescription</key>
            <string>${description}</string>
            <key>PayloadDisplayName</key>
            <string>${displayName}</string>
            <key>PayloadIdentifier</key>
            <string>${identifier}.certificate</string>
            <key>PayloadType</key>
            <string>com.apple.security.root</string>
            <key>PayloadUUID</key>
            <string>${certUUID}</string>
            <key>PayloadVersion</key>
            <integer>${version}</integer>
        </dict>
    </array>
    <key>PayloadDescription</key>
    <string>${description}</string>
    <key>PayloadDisplayName</key>
    <string>${displayName}</string>
    <key>PayloadIdentifier</key>
    <string>${identifier}</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${profileUUID}</string>
    <key>PayloadVersion</key>
    <integer>${version}</integer>
    <key>PayloadOrganization</key>
    <string>${organization}</string>
</dict>
</plist>`;

    return mobileConfigXML;
}

/**
 * Generate Windows PowerShell script for automatic certificate installation
 */
function generateWindowsInstaller(certificatePath, options = {}) {
    const {
        storeName = 'Root',
        storeLocation = 'LocalMachine'
    } = options;

    const certData = fs.readFileSync(certificatePath);
    const certBase64 = certData.toString('base64');

    const powershellScript = `# Fortinet CA Certificate Auto-Installer
# This script automatically installs the Fortinet CA certificate into the Windows certificate store

Write-Host "Installing Fortinet CA Certificate..." -ForegroundColor Green

try {
    # Certificate data (Base64 encoded)
    $certData = @"
${certBase64}
"@

    # Convert to certificate object
    $certBytes = [Convert]::FromBase64String($certData)
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certBytes)

    # Open certificate store
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("${storeName}", "${storeLocation}")
    $store.Open("ReadWrite")

    # Add certificate to store
    $store.Add($cert)
    $store.Close()

    Write-Host "Certificate installed successfully!" -ForegroundColor Green
    Write-Host "Subject: " $cert.Subject -ForegroundColor Yellow
    Write-Host "Issuer: " $cert.Issuer -ForegroundColor Yellow
    Write-Host "Thumbprint: " $cert.Thumbprint -ForegroundColor Yellow

    # Pause to show result
    Write-Host ""
    Write-Host "Press any key to continue..." -ForegroundColor Cyan
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

} catch {
    Write-Host "Error installing certificate: $_" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow

    # Pause to show error
    Write-Host ""
    Write-Host "Press any key to continue..." -ForegroundColor Cyan
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}`;

    return powershellScript;
}

/**
 * Generate Android installation instructions with direct links
 */
function generateAndroidInstructions(certificateUrl) {
    return {
        directInstallUrl: `intent://${certificateUrl.replace('https://', '').replace('http://', '')}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`,
        settingsUrl: 'intent://settings/#Intent;action=android.settings.SECURITY_SETTINGS;end',
        wifiSettingsUrl: 'intent://settings/#Intent;action=android.settings.WIFI_SETTINGS;end',
        steps: [
            'Download certificate automatically starting...',
            'Open Downloads folder or notification',
            'Tap the certificate file',
            'Name it "Fortinet CA" and select "VPN and apps"',
            'Tap OK to install'
        ]
    };
}

module.exports = {
    generateMobileConfig,
    generateWindowsInstaller,
    generateAndroidInstructions
};