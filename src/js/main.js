const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const macaddress = require('macaddress');
const prompt = require('electron-prompt');
const os = require('os');
const { execSync, exec, execFile } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      devTools: false,
    },
  });
  mainWindow.setContentProtection(true);
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  storeAndVerifyUUID();
  checkForScreenRecordingSoftware();
  setInterval(checkForScreenRecordingSoftware, 10000);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function getDriveUUID() {
  let uuid;
  const driveLabel = 'Movies24';

  if (os.platform() === 'darwin') {
    const drivePath = `/Volumes/${driveLabel}`;

    if (!fs.existsSync(drivePath)) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'License Dongle Not Connected',
        message: 'The license dongle is not connected. Please insert the USB drive and try again.',
      });
      app.quit();
      return;
    }

    try {
      const output = execSync(`diskutil info ${drivePath} | grep "Volume UUID"`).toString();
      uuid = output.split(': ').pop().trim();
    } catch (error) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'Error',
        message: 'Failed to retrieve the UUID of the USB drive.',
      });
      app.quit();
      return;
    }
  } else if (os.platform() === 'win32') {
    try {
      const output = execSync(`wmic logicaldisk where "VolumeName='${driveLabel}'" get VolumeSerialNumber`, { encoding: 'utf-8' }).toString();
      const lines = output.trim().split('\n');
      uuid = lines[1].trim();
    } catch (error) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'License Dongle Not Connected',
        message: 'The license dongle is not connected or the drive could not be found. Please insert the USB drive and try again.',
      });
      app.quit();
      return;
    }
  }

  return uuid;
}

function storeAndVerifyUUID() {
  const uuidFilePath = path.join(__dirname, 'drive_uuid.json');
  const driveUUID = getDriveUUID();

  if (!driveUUID) {
    console.log('Unable to retrieve the UUID of the USB drive.');
    app.quit();
    return;
  }

  if (!fs.existsSync(uuidFilePath)) {
    try {
      fs.writeJsonSync(uuidFilePath, { uuid: driveUUID });
      console.log('Stored the UUID for future verification.');
    } catch (error) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'Error',
        message: 'Failed to write the drive UUID. Please try again.',
      });
      app.quit();
    }
  } else {
    try {
      const storedUUID = fs.readJsonSync(uuidFilePath).uuid;
      if (storedUUID !== driveUUID) {
        dialog.showMessageBoxSync({
          type: 'error',
          title: 'UUID Mismatch',
          message: 'UUID mismatch. The application will not run.',
        });
        app.quit();
      } else {
        console.log('UUID matched. Continuing...');
      }
    } catch (error) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'Error',
        message: 'Failed to read the drive UUID. Please try again.',
      });
      app.quit();
    }
  }
}

ipcMain.handle('get-mac-address', async () => {
  const mac = await macaddress.one();
  return mac;
});

ipcMain.handle('register-device', async (event, macAddress) => {
  const validLicenseKey = "000-123-456-789";
  const devicesFile = path.join(__dirname, 'devices.json');
  let devices = [];

  if (fs.existsSync(devicesFile)) {
    try {
      const fileData = fs.readFileSync(devicesFile, 'utf-8');
      if (fileData) {
        devices = JSON.parse(fileData);
      }
    } catch (error) {
      console.error('Error reading devices.json: ', error);
      return { success: false, message: 'Failed to read device data. Please try again.' };
    }
  } else {
    console.log('devices.json does not exist, creating a new one.');
    fs.writeJsonSync(devicesFile, devices);
  }

  const existingDevice = devices.find(device => device.macAddress === macAddress);

  if (!existingDevice && devices.length >= 3) {
    console.log('Maximum devices reached.');
    return { success: false, message: 'Maximum devices reached.' };
  }

  if (existingDevice && existingDevice.licenseValidated) {
    console.log('Device already validated. Skipping license key prompt.');
    return { success: true };
  }

  const licenseKey = await prompt({
    title: 'License Agreement',
    label: `${3 - devices.length} devices remaining on this license.`,
    inputAttrs: {
      type: 'checkbox',
      value: '000-123-456-789',
      required: true,
    },
    type: 'input',
  });

  if (licenseKey === null) {
    console.log('License key prompt was cancelled.');
    return { success: false, message: 'License key prompt was cancelled.' };
  }

  if (licenseKey !== validLicenseKey) {
    console.log('Invalid license key entered.');
    return { success: false, message: 'Invalid license key.' };
  }

  if (!existingDevice) {
    devices.push({ macAddress, licenseValidated: true });
  } else {
    existingDevice.licenseValidated = true;
  }

  try {
    fs.writeJsonSync(devicesFile, devices);
  } catch (error) {
    console.error('Error writing to devices.json: ', error);
    return { success: false, message: 'Failed to register device. Please try again.' };
  }

  return { success: true };
});

ipcMain.handle('load-chapters', async () => {
  const chaptersFile = path.join(__dirname, 'chapters.json');
  if (fs.existsSync(chaptersFile)) {
    try {
      const chapters = JSON.parse(fs.readFileSync(chaptersFile, 'utf-8'));
      return chapters;
    } catch (error) {
      console.error('Error reading chapters.json: ', error);
      throw new Error('Failed to load chapters.');
    }
  } else {
    throw new Error('Chapters file not found.');
  }
});

ipcMain.handle('load-video', async () => {
  const devicesFile = path.join(__dirname, 'devices.json');
  const macAddress = await macaddress.one();
  let devices = [];

  if (fs.existsSync(devicesFile)) {
    try {
      devices = JSON.parse(fs.readFileSync(devicesFile, 'utf-8'));
    } catch (error) {
      console.error('Error reading devices.json: ', error);
    }
  }

  const existingDevice = devices.find(device => device.macAddress === macAddress);

  if (!existingDevice || !existingDevice.licenseValidated) {
    console.log('Device not registered or not validated. Prompting for license.');
    const result = await ipcMain.handle('register-device', macAddress);
    if (!result.success) {
      throw new Error(result.message);
    }
  }

  console.log('Loading video for registered and validated device.');

  const videoElement = document.createElement('video');
  videoElement.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
});

function checkForScreenRecordingSoftware() {
  const knownScreenRecordersWin = [
    'CamtasiaStudio', 'Camtasia', 'Camtasia 2', 'OBS', 'OBS Studio', 'Movavi Screen Recorder', 'Movavi', 'ScreenRec', 'ScreenPal', 'Apowersoft', 'Debut Video Capture', 'Icecream', 'Icecream Screen Recorder', 'Screencast-o-matic', 'Screencast', 'Screencastify', 'ScreenFlow', 'ShareX', 'FlashBack', 'FlashBack Recorder', 'iSpring Suite', 'iSpring', 'obs64', 'ScreenFlow', 'SnagitEditor', 'TinyTake', 'Bandicam', 'Loom', 'Ezvid', 'CamStudio', 'Notta', 'Free Cam', 'Freecam', 'Zappy', 'Riverside', 'ShadowPlay', 'ScreenPal', 'QuickTime', 'Twitch Studio', 'Twitch' 
  ];

  const knownScreenRecordersMac = [
    'CamtasiaStudio', 'Camtasia', 'Camtasia 2', 'OBS', 'OBS Studio', 'Movavi Screen Recorder', 'Movavi', 'ScreenRec', 'ScreenPal', 'Apowersoft', 'Debut Video Capture', 'Icecream', 'Icecream Screen Recorder', 'Screencast-o-matic', 'Screencast', 'Screencastify', 'ScreenFlow', 'ShareX', 'FlashBack', 'FlashBack Recorder', 'iSpring Suite', 'iSpring', 'obs64', 'ScreenFlow', 'SnagitEditor', 'TinyTake', 'Bandicam', 'Loom', 'Ezvid', 'CamStudio', 'Notta', 'Free Cam', 'Freedom', 'Zappy', 'Riverside', 'ShadowPlay', 'ScreenPal', 'QuickTime', 'Twitch Studio', 'Twitch' 
  ];

const checkProcesses = (processList, knownRecorders) => {
    return knownRecorders.some(processName => processList.toLowerCase().includes(processName.toLowerCase()));
  };

  if (os.platform() === 'win32') {
    execFile('tasklist', (err, stdout, stderr) => {
      if (err) {
        console.error('Error executing tasklist:', err);
        return;
      }

     // console.log('Tasklist output:', stdout); // Log the output to debug

      if (checkProcesses(stdout, knownScreenRecordersWin)) {
        closeAppWithWarning();
      }
    });
  } else if (os.platform() === 'darwin') {
    execFile('ps', ['-ax'], (err, stdout, stderr) => {
      if (err) {
        console.error('Error executing ps -ax:', err);
        return;
      }

      // console.log('ps -ax output:', stdout); // Log the output to debug

      if (checkProcesses(stdout, knownScreenRecordersMac)) {
        closeAppWithWarning();
      }
    });
  } else {
    console.error('Unsupported OS platform for screen recording detection.');
  }
}

function closeAppWithWarning() {
  if (mainWindow) {
    mainWindow.destroy(); // Close the main window first
  }
  
  // Show the warning dialog after the window is closed
  dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Screen Recording Detected',
    message: `The application detected unauthorized activity and will now close.`,
  });
  
  // Quit the application after the dialog is dismissed
  app.quit();
}
    
 


app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});