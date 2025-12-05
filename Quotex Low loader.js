//লাইসেন্স যাচাইয়ের ফাংশন - Quotex Premium Code
(async function () {
  // Demo Account Auto-Select
  async function autoSelectDemoAccount() {
    try {
      const isDemoSelected = document.querySelector('.---react-features-Usermenu-styles-module__infoName--SfrTV.---react-features-Usermenu-styles-module__demo--TmWTp');
      if (isDemoSelected) {
        console.log('✓ Demo Account already selected');
        return true;
      }
      console.log('⚡ Starting demo account selection...');
      const currentLang = window.location.pathname.split('/')[1] || 'en';
      const dropdownButton = document.querySelector('.---react-features-Usermenu-styles-module__infoCaret--P6gJl');
      if (!dropdownButton) return false;
      dropdownButton.click();
      await new Promise(resolve => setTimeout(resolve, 100));
      let demoAccountLink = document.querySelector(`a[href="/${currentLang}/demo-trade"]`) || document.querySelector('a[href*="/demo-trade"]');
      if (!demoAccountLink) return false;
      demoAccountLink.click();
      await new Promise(resolve => setTimeout(resolve, 200));
      const closeButton = document.querySelector('.modal-account-type-changed__body-button, .modal__close');
      if (closeButton) {
        closeButton.click();
        console.log('✓ Demo account selected successfully!');
      }
      return true;
    } catch (error) {
      console.log('× Error:', error.message);
      return false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(autoSelectDemoAccount, 200));
  } else {
    setTimeout(autoSelectDemoAccount, 200);
  }

  if (typeof Swal === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  const SERVER_URL = 'https://channelcanada.pythonanywhere.com/api/verify';
  const SCRIPT_URL = 'https://channelcanada.pythonanywhere.com/api/get-script';
  const PROJECT_NAME = 'Quotex Low Quality';
  let isLicenseVerified = false;
  let settingsPopup = null;

  function getDeviceInfo() {
    const userAgent = navigator.userAgent;
    let deviceType = 'Unknown', browser = 'Unknown', os = 'Unknown';
    if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('SamsungBrowser')) browser = 'Samsung Browser';
    else if (userAgent.includes('Opera') || userAgent.includes('OPR/')) browser = 'Opera';
    else if (userAgent.includes('Trident')) browser = 'Internet Explorer';
    else if (userAgent.includes('Edge')) browser = 'Edge';
    else if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad') || userAgent.includes('iPod')) os = 'iOS';
    else if (userAgent.includes('Macintosh')) os = 'Mac OS';
    else if (userAgent.includes('Windows')) os = 'Windows';
    if (userAgent.includes('Mobile')) deviceType = 'Mobile';
    else if (userAgent.includes('Tablet')) deviceType = 'Tablet';
    else deviceType = 'Desktop';
    return {
      fingerprint: localStorage.getItem('quotexLowDeviceFingerprint') || 'dev_' + Math.random().toString(36).substring(2, 15),
      deviceType, browser, os, userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      cpuClass: navigator.cpuClass || 'Unknown',
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      plugins: Array.from(navigator.plugins).map(p => p.name).join(', '),
      hardwareConcurrency: navigator.hardwareConcurrency || 'Unknown'
    };
  }

  function getDeviceId() {
    let deviceId = localStorage.getItem('quotexLowCustomDeviceId');
    if (!deviceId) {
      deviceId = 'dev-' + Math.random().toString(36).substr(2, 12) + '-' + navigator.hardwareConcurrency + '-' + screen.width + 'x' + screen.height;
      localStorage.setItem('quotexLowCustomDeviceId', deviceId);
    }
    return deviceId;
  }

  async function verifyActivation(activationKey) {
    const deviceId = getDeviceId();
    const deviceInfo = getDeviceInfo();
    if (!localStorage.getItem('quotexLowDeviceFingerprint')) {
      localStorage.setItem('quotexLowDeviceFingerprint', deviceInfo.fingerprint);
    }
    try {
      const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: activationKey,
          device_id: deviceId,
          device_info: deviceInfo,
          project_type: PROJECT_NAME,
          is_recheck: !!localStorage.getItem('quotexLowAppActivation')
        })
      });
      const data = await response.json();
      if (data.valid || data.status === 'success') {
        if (data.project_type && data.project_type !== PROJECT_NAME) {
          return {
            valid: false,
            reason: 'wrong_project',
            wrongProject: data.project_type,
            message: `This license belongs to "${data.project_type}" project.`
          };
        }
        localStorage.setItem('quotexLowAppActivation', activationKey);
        localStorage.setItem('quotexLowLastVerified', Date.now());
        isLicenseVerified = true;
        return { valid: true, key: activationKey };
      } else if (data.message && data.message.includes('Network limit')) {
        return {
          valid: false,
          reason: 'limit',
          allowed: data.allowed_devices || 3,
          used: data.used_devices || 'unknown'
        };
      } else if (data.message && data.message.includes('wrong project')) {
        return {
          valid: false,
          reason: 'wrong_project',
          wrongProject: data.project_type || 'UNKNOWN',
          message: data.message
        };
      } else {
        if (localStorage.getItem('quotexLowAppActivation') === activationKey) {
          localStorage.removeItem('quotexLowAppActivation');
          localStorage.removeItem('quotexLowLastVerified');
          isLicenseVerified = false;
        }
        return { valid: false, reason: 'invalid' };
      }
    } catch (error) {
      console.error('Verification failed:', error);
      return { valid: false, reason: 'network' };
    }
  }

  async function checkExistingActivation() {
    const savedKey = localStorage.getItem('quotexLowAppActivation');
    if (savedKey) {
      console.log('Found existing activation, verifying...');
      const verificationResult = await verifyActivation(savedKey);
      if (!verificationResult.valid) {
        localStorage.removeItem('quotexLowAppActivation');
        localStorage.removeItem('quotexLowLastVerified');
        isLicenseVerified = false;
      } else {
        isLicenseVerified = true;
      }
      return verificationResult;
    }
    isLicenseVerified = false;
    return { valid: false };
  }

  async function runMainScript() {
    if (!isLicenseVerified) {
      console.error('License not verified!');
      return;
    }
    try {
      const activationKey = localStorage.getItem('quotexLowAppActivation');
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: activationKey,
          project_type: PROJECT_NAME
        })
      });
      if (response.ok) {
        const scriptCode = await response.text();
        eval(scriptCode);
        console.log('✅ Quotex Premium Code script loaded successfully!');
        showCenteredMessage("Developer @traderjisanx !", 5000);
      } else {
        console.error('Failed to load script:', response.status);
        showMessage('error', 'Failed to load script. Contact support.');
      }
    } catch (error) {
      console.error('Error loading script:', error);
    }
  }

  function showMessage(type, text, duration = 3000) {
    const messageElement = document.createElement('div');
    messageElement.className = `message-popup ${type}`;
    messageElement.textContent = text;
    document.body.appendChild(messageElement);
    setTimeout(() => messageElement.classList.add('show'), 10);
    setTimeout(() => {
      messageElement.classList.remove('show');
      setTimeout(() => messageElement.remove(), 500);
    }, duration);
  }

  function showCenteredMessage(text, duration) {
    const el = document.createElement('div');
    el.id = 'centeredDeveloperMessage';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '1';
    }, 10);
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 500);
    }, duration);
  }

  // UI Styles
  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
    #settingsPopup {position: fixed;top: 50%;left: 50%;transform: translate(-50%, -50%) scale(0.8);width: 100%;max-width: 380px;max-height: 92vh;padding: 15px;background: rgba(30, 11, 54, 0.95);backdrop-filter: blur(10px);border-radius: 12px;box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);text-align: center;border: 1px solid rgba(248, 0, 255, 0.2);overflow-y: auto;overflow-x: hidden;font-family: 'Poppins', sans-serif;color: #f8f8f8;z-index: 9999;opacity: 0;transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);}
    #settingsPopup::-webkit-scrollbar {width: 8px;}
    #settingsPopup::-webkit-scrollbar-track {background: rgba(255, 255, 255, 0.1);border-radius: 10px;}
    #settingsPopup::-webkit-scrollbar-thumb {background: linear-gradient(135deg, #8333ff, #f900ff);border-radius: 10px;}
    #settingsPopup::before {content: '';position: absolute;top: 0;left: 0;right: 0;height: 5px;background: linear-gradient(to right, #f900ff, #00d9ff);background-size: 200% 200%;animation: gradientFlow 3s linear infinite;border-radius: 12px 12px 0 0;}
    @keyframes gradientFlow {0% { background-position: 0% 50%; }50% { background-position: 100% 50%; }100% { background-position: 0% 50%; }}
    #settingsPopup.show {opacity: 1;transform: translate(-50%, -50%) scale(1);}
    #settingsPopup.hide {opacity: 0;transform: translate(-50%, -50%) scale(0.8);}
    #settingsPopup h2 {color: white;font-size: 10px;font-weight: 600;margin: 0 0 8px 0;padding: 6px;background: linear-gradient(90deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.9) 100%);border-radius: 8px;text-shadow: 0 0 5px rgba(255, 255, 255, 0.5);border: 1px solid rgba(248, 0, 255, 0.3);line-height: 1.4;}
    #settingsPopup h2 .warning-text {color: #ff3366;font-weight: 700;animation: warningPulse 2s infinite alternate;}
    @keyframes warningPulse {from { text-shadow: 0 0 5px rgba(255, 51, 102, 0.5); }to { text-shadow: 0 0 15px rgba(255, 51, 102, 0.9), 0 0 20px rgba(255, 51, 102, 0.7); }}
    #settingsPopup h3 {color: white;font-size: 14px;font-weight: 700;margin: 10px 0 8px 0;text-transform: uppercase;letter-spacing: 1px;background: linear-gradient(to right, #f900ff, #00d9ff);-webkit-background-clip: text;background-clip: text;-webkit-text-fill-color: transparent;position: relative;display: inline-block;}
    #settingsPopup h3::after {content: '';position: absolute;width: 60%;height: 2px;bottom: -8px;left: 20%;background: linear-gradient(to right, #f900ff, #00d9ff);border-radius: 10px;}
    .telegram-link {display: inline-block;margin-bottom: 8px;}
    .telegram-link img {width: 36px;height: 36px;cursor: pointer;border-radius: 50%;border: 2px solid rgba(255, 255, 255, 0.2);box-shadow: 0 0 15px rgba(248, 0, 255, 0.5);transition: all 0.3s ease;}
    .telegram-link img:hover {transform: scale(1.1) rotate(5deg);box-shadow: 0 0 20px rgba(248, 0, 255, 0.7);border-color: rgba(255, 255, 255, 0.4);}
    #settingsPopup label {display: block;margin-bottom: 8px;color: rgba(255, 255, 255, 0.9);font-size: 11px;font-weight: 500;text-align: left;}
    #settingsPopup input {width: 100%;padding: 8px;margin-top: 3px;border: 2px solid rgba(255, 255, 255, 0.2);border-radius: 10px;background: rgba(255, 255, 255, 0.1);color: white;font-size: 14px;box-sizing: border-box;font-family: 'Poppins', sans-serif;transition: all 0.3s ease;}
    #settingsPopup input::placeholder {color: rgba(255, 255, 255, 0.5);}
    #settingsPopup input:focus {outline: none;border-color: #f900ff;box-shadow: 0 0 0 3px rgba(248, 0, 255, 0.3);background: rgba(255, 255, 255, 0.15);}
    #settingsPopup button {width: 100%;padding: 8px;margin-top: 6px;border: none;border-radius: 10px;font-size: 14px;font-weight: 600;cursor: pointer;transition: all 0.3s ease;text-transform: uppercase;letter-spacing: 1px;position: relative;overflow: hidden;font-family: 'Poppins', sans-serif;background: linear-gradient(135deg, #8333ff, #f900ff);color: white;box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);}
    #settingsPopup button::before {content: '';position: absolute;top: 0;left: -100%;width: 100%;height: 100%;background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);transition: all 0.5s ease;}
    #settingsPopup button:hover::before {left: 100%;}
    #settingsPopup button:hover {transform: translateY(-2px);box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);}
    #settingsPopup button:active {transform: translateY(0);}
    #settingsPopup button.close-btn {background: linear-gradient(135deg, #ff3366, #ff5757);}
    #settingsPopup button:disabled {background: #6c757d;cursor: not-allowed;opacity: 0.6;}
    #licenseSection {margin-top: 10px;padding: 12px;background: rgba(255, 255, 255, 0.05);border-radius: 10px;border: 1px solid rgba(255, 255, 255, 0.1);transition: all 0.3s ease;}
    #licenseSection.hide {opacity: 0;max-height: 0;padding: 0;margin: 0;overflow: hidden;border: none;}
    .verified-badge, .unverified-badge {display: inline-block;padding: 6px 12px;border-radius: 20px;font-size: 12px;font-weight: 600;margin-top: 8px;}
    .verified-badge {background: linear-gradient(135deg, #10b981, #059669);color: white;box-shadow: 0 0 15px rgba(16, 185, 129, 0.5);}
    .unverified-badge {background: linear-gradient(135deg, #ef4444, #dc2626);color: white;box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);}
    .message-popup {position: fixed;top: 80px;right: 20px;padding: 15px 20px;color: white;border-radius: 12px;font-size: 14px;font-weight: 600;box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);opacity: 0;transform: translateY(-20px);transition: opacity 0.5s ease, transform 0.5s ease;z-index: 10001;max-width: 300px;text-align: center;backdrop-filter: blur(10px);border: 1px solid rgba(255, 255, 255, 0.1);font-family: 'Poppins', sans-serif;}
    .message-popup.show {opacity: 1;transform: translateY(0);}
    .message-popup.success {background: linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95));}
    .message-popup.error {background: linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95));}
    .message-popup.info {background: linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95));}
    @media (max-width: 400px) {#settingsPopup {max-width: 95%;padding: 12px;}}
    
    /* Centered Developer Message */
    #centeredDeveloperMessage {
      position: fixed; 
      top: 50%; 
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      color: white; 
      padding: 25px 45px; 
      border-radius: 15px;
      font-size: 18px; 
      font-weight: bold;
      z-index: 10004; 
      opacity: 0;
      transition: opacity 0.5s ease;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      border: 2px solid rgba(248, 0, 255, 0.5);
      font-family: 'Poppins', sans-serif;
      text-align: center;
    }
    
    /* SweetAlert Custom Styling - High Z-Index */
    .swal-high-z {z-index: 99999 !important;}
    .swal2-container.swal-high-z {z-index: 99999 !important;}
    .swal-custom-popup {
      background: rgba(30, 11, 54, 0.98) !important;
      backdrop-filter: blur(15px) !important;
      border: 2px solid rgba(248, 0, 255, 0.3) !important;
      border-radius: 16px !important;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(248, 0, 255, 0.3) !important;
      font-family: 'Poppins', sans-serif !important;
      position: relative !important;
      overflow: hidden !important;
    }
    .swal-custom-popup::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 6px;
      background: linear-gradient(to right, #f900ff, #00d9ff, #f900ff);
      background-size: 200% 200%;
      animation: gradientFlow 3s linear infinite;
    }
    .swal-custom-title {
      color: white !important;
      font-size: 20px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 1px !important;
      background: linear-gradient(to right, #f900ff, #00d9ff) !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
      margin-top: 25px !important;
    }
    .swal2-html-container {
      color: rgba(255, 255, 255, 0.9) !important;
      font-family: 'Poppins', sans-serif !important;
    }
    .swal-custom-button {
      background: linear-gradient(135deg, #8333ff, #f900ff) !important;
      border: none !important;
      border-radius: 10px !important;
      padding: 10px 30px !important;
      font-size: 15px !important;
      font-weight: 600 !important;
      text-transform: uppercase !important;
      letter-spacing: 1px !important;
      box-shadow: 0 5px 20px rgba(131, 51, 255, 0.4) !important;
      transition: all 0.3s ease !important;
      font-family: 'Poppins', sans-serif !important;
    }
    .swal-custom-button:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 8px 25px rgba(131, 51, 255, 0.6) !important;
    }
    .swal2-icon.swal2-error {
      border-color: #f900ff !important;
      color: #f900ff !important;
    }
    .swal2-icon.swal2-error [class^='swal2-x-mark-line'] {
      background-color: #f900ff !important;
    }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Create Settings Popup
  async function createSettingsPopup() {
    const verificationResult = await checkExistingActivation();
    isLicenseVerified = verificationResult.valid;
    
    const popup = document.createElement('div');
    popup.innerHTML = `
      <div id="settingsPopup">
        <h2>Developer: <strong>JISAN X</strong> - <span class="warning-text">Buying from others will result in fraud!</span></h2>
        <a href="https://t.me/traderjisanx" target="_blank" class="telegram-link">
            <img src="https://i.postimg.cc/52k5pJD3/photo-2025-05-11-11-00-00.jpg" alt="Telegram">
        </a>
        <div id="licenseSection" class="${isLicenseVerified ? 'hide' : ''}">
          <h3>Quotex Premium Code License</h3>
          <input type="text" id="licenseInput" placeholder="Enter your license key" value="${localStorage.getItem('quotexLowAppActivation') || ''}">
          <button id="verifyBtn">Verify License</button>
          <div id="verificationStatus">
            ${isLicenseVerified ? '<div class="verified-badge">✓ Verified</div>' : 
              localStorage.getItem('quotexLowAppActivation') ? '<div class="unverified-badge">✗ License Expired/Invalid</div>' : 
              '<div class="unverified-badge">✗ Not Verified</div>'}
          </div>
        </div>
        <button class="close-btn" id="closePopupBtn">Close</button>
      </div>
    `;
    
    document.body.appendChild(popup);
    settingsPopup = document.getElementById('settingsPopup');
    setTimeout(() => settingsPopup.classList.add('show'), 50);

    // Event Listeners
    document.getElementById('verifyBtn').addEventListener('click', async () => {
      const licenseKey = document.getElementById('licenseInput').value.trim();
      if (!licenseKey) {
        showMessage('error', 'Please enter a license key');
        return;
      }
      document.getElementById('verifyBtn').textContent = 'Verifying...';
      document.getElementById('verifyBtn').disabled = true;
      const result = await verifyActivation(licenseKey);
      if (result.valid) {
        showMessage('success', 'License verified successfully!');
        document.getElementById('verificationStatus').innerHTML = '<div class="verified-badge">✓ Verified</div>';
        document.getElementById('licenseSection').classList.add('hide');
        setTimeout(() => {
          closePopup();
          runMainScript();
        }, 1500);
      } else {
        let errorMsg = 'Invalid license key';
        let errorTitle = 'License Verification Failed';
        let errorHtml = '';
        
        if (result.reason === 'limit') {
          errorTitle = 'Network Limit Reached';
          errorMsg = `Network limit reached (${result.used}/${result.allowed})`;
          errorHtml = `
            <div style="text-align: center; padding: 20px; font-family: 'Poppins', sans-serif;">
              <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 12px; border: 1px solid rgba(248, 0, 255, 0.2); margin-bottom: 20px;">
                <p style="color: #ff3366; font-size: 16px; margin-bottom: 15px; font-weight: 600;">Network limit exceeded!</p>
                <div style="display: flex; justify-content: space-around; margin: 15px 0;">
                  <div style="text-align: center;">
                    <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 5px;">Allowed</p>
                    <p style="font-size: 24px; color: #10b981; font-weight: 700; margin: 0;">${result.allowed}</p>
                  </div>
                  <div style="text-align: center;">
                    <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 5px;">Used</p>
                    <p style="font-size: 24px; color: #ef4444; font-weight: 700; margin: 0;">${result.used}</p>
                  </div>
                </div>
              </div>
              <p style="font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 20px;">Contact developer to increase limit or clear devices</p>
              <a href="https://t.me/traderjisanx" target="_blank" 
                 style="display: inline-block; padding: 12px 30px; 
                        background: linear-gradient(135deg, #8333ff, #f900ff); 
                        color: white; text-decoration: none; border-radius: 10px; 
                        font-weight: 600; box-shadow: 0 5px 20px rgba(131, 51, 255, 0.5);
                        transition: all 0.3s ease; text-transform: uppercase; letter-spacing: 1px; font-size: 14px;">
                Contact on Telegram
              </a>
            </div>
          `;
        } else if (result.reason === 'wrong_project') {
          errorTitle = 'Wrong Project License';
          errorMsg = `Wrong project! This is for ${result.wrongProject}`;
          errorHtml = `
            <div style="text-align: center; padding: 20px; font-family: 'Poppins', sans-serif;">
              <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 12px; border: 1px solid rgba(248, 0, 255, 0.2); margin-bottom: 20px;">
                <p style="color: #ff3366; font-size: 16px; margin-bottom: 15px; font-weight: 600;">License project mismatch!</p>
                <div style="background: rgba(25, 118, 210, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #1976d2;">
                  <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 3px;">Your License</p>
                  <p style="font-size: 16px; color: #1976d2; font-weight: 700; margin: 0;">${result.wrongProject}</p>
                </div>
                <div style="background: rgba(131, 51, 255, 0.2); padding: 12px; border-radius: 8px; border-left: 4px solid #8333ff;">
                  <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 3px;">Required</p>
                  <p style="font-size: 16px; color: #8333ff; font-weight: 700; margin: 0;">Quotex Premium Code</p>
                </div>
              </div>
              <p style="font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 20px;">Please use correct project license</p>
              <a href="https://t.me/traderjisanx" target="_blank" 
                 style="display: inline-block; padding: 12px 30px; 
                        background: linear-gradient(135deg, #8333ff, #f900ff); 
                        color: white; text-decoration: none; border-radius: 10px; 
                        font-weight: 600; box-shadow: 0 5px 20px rgba(131, 51, 255, 0.5);
                        transition: all 0.3s ease; text-transform: uppercase; letter-spacing: 1px; font-size: 14px;">
                Get Quotex Low License
              </a>
            </div>
          `;
        } else if (result.reason === 'network') {
          errorTitle = 'Connection Error';
          errorMsg = 'Connection error. Check server.';
          errorHtml = `
            <div style="text-align: center; padding: 20px; font-family: 'Poppins', sans-serif;">
              <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.3); margin-bottom: 20px;">
                <p style="color: #f59e0b; font-size: 16px; margin-bottom: 15px; font-weight: 600;">Unable to connect to license server</p>
                <p style="font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 10px;">Please check:</p>
                <ul style="text-align: left; padding-left: 30px; font-size: 13px; color: rgba(255,255,255,0.8); line-height: 1.8;">
                  <li>Internet connection</li>
                  <li>Server is running</li>
                  <li>Firewall settings</li>
                </ul>
              </div>
            </div>
          `;
        } else {
          errorTitle = 'Invalid License Key';
          errorMsg = 'Invalid license key';
          errorHtml = `
            <div style="text-align: center; padding: 20px; font-family: 'Poppins', sans-serif;">
              <div style="background: rgba(255, 255, 255, 0.05); padding: 25px; border-radius: 12px; border: 1px solid rgba(248, 0, 255, 0.2); margin-bottom: 20px;">
                <div style="width: 60px; height: 60px; margin: 0 auto 15px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px rgba(239, 68, 68, 0.5);">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                </div>
                <p style="color: #ff3366; font-size: 18px; margin-bottom: 10px; font-weight: 700;">Invalid or Blocked License!</p>
                <p style="font-size: 14px; color: rgba(255,255,255,0.8); margin-bottom: 15px; line-height: 1.6;">
                  The license key you entered is not valid or has been blocked.
                </p>
                <div style="background: rgba(131, 51, 255, 0.1); padding: 12px; border-radius: 8px; border-left: 4px solid #8333ff;">
                  <p style="font-size: 13px; color: rgba(255,255,255,0.9); margin: 0;">
                    Contact developer to get a valid <strong style="color: #f900ff;">Quotex Premium Code</strong> license.
                  </p>
                </div>
              </div>
              <a href="https://t.me/traderjisanx" target="_blank" 
                 style="display: inline-block; padding: 12px 30px; 
                        background: linear-gradient(135deg, #8333ff, #f900ff); 
                        color: white; text-decoration: none; border-radius: 10px; 
                        font-weight: 600; box-shadow: 0 5px 20px rgba(131, 51, 255, 0.5);
                        transition: all 0.3s ease; text-transform: uppercase; letter-spacing: 1px; font-size: 14px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style="vertical-align: middle; margin-right: 8px;">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                </svg>
                Contact Developer
              </a>
            </div>
          `;
        }
        
        // Show SweetAlert popup
        Swal.fire({
          icon: 'error',
          title: errorTitle,
          html: errorHtml,
          confirmButtonText: 'OK',
          confirmButtonColor: '#8333ff',
          allowOutsideClick: false,
          customClass: {
            container: 'swal-high-z',
            popup: 'swal-custom-popup',
            title: 'swal-custom-title',
            confirmButton: 'swal-custom-button'
          }
        });
        
        showMessage('error', errorMsg);
        document.getElementById('verificationStatus').innerHTML = '<div class="unverified-badge">✗ ' + errorMsg + '</div>';
      }
      document.getElementById('verifyBtn').textContent = 'Verify License';
      document.getElementById('verifyBtn').disabled = false;
    });

    document.getElementById('closePopupBtn').addEventListener('click', () => {
      if (!isLicenseVerified) {
        const confirm = window.confirm('License not verified. Are you sure you want to close?');
        if (!confirm) return;
      }
      closePopup();
    });
  }

  function closePopup() {
    if (settingsPopup) {
      settingsPopup.classList.remove('show');
      settingsPopup.classList.add('hide');
      setTimeout(() => {
        if (settingsPopup && settingsPopup.parentElement) {
          settingsPopup.parentElement.remove();
        }
        settingsPopup = null;
      }, 400);
    }
  }

  // Initialize
  const storedKey = localStorage.getItem('quotexLowAppActivation');
  const lastVerified = localStorage.getItem('quotexLowLastVerified');
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  if (storedKey && lastVerified && (now - parseInt(lastVerified) < oneHour)) {
    console.log('Reverifying stored license...');
    const verification = await verifyActivation(storedKey);
    if (verification.valid) {
      console.log('✅ License still valid, loading script...');
      await runMainScript();
    } else {
      console.log('❌ Stored license no longer valid, showing popup...');
      await createSettingsPopup();
    }
  } else {
    await createSettingsPopup();
  }
})();
