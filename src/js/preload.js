const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Define the file paths for the key and IV
const keyPath = path.join(__dirname, '../.encryption_data', 'key.txt');
const ivPath = path.join(__dirname, '../.encryption_data', 'iv.txt');

// Read the key and IV from their respective files
const key = fs.readFileSync(keyPath, 'utf-8').trim();
const iv = fs.readFileSync(ivPath, 'utf-8').trim();

// Function to decrypt the video buffer
function decryptVideo(encryptedBuffer) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBuffer)),
    decipher.final()
  ]);
  return decrypted;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getMacAddress: () => ipcRenderer.invoke('get-mac-address'),
  registerDevice: (macAddress) => ipcRenderer.invoke('register-device', macAddress),
  decryptVideoBuffer: (buffer) => decryptVideo(buffer),
  loadChapters: () => ipcRenderer.invoke('load-chapters')
});
