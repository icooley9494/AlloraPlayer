window.addEventListener('DOMContentLoaded', async () => {
  const loadingElement = document.getElementById('loading');
  const chapterContainer = document.getElementById('chapter-container');
  const videoContainer = document.getElementById('video-container');
  const videoElement = document.getElementById('video');
  const backButton = document.getElementById('back-button');
  const playButton = document.getElementById('play');
  const pauseButton = document.getElementById('pause');
  const fullscreenButton = document.getElementById('fullscreen');
  const backToBeginningButton = document.getElementById('back-to-beginning');

  async function initialize() {
    console.log('Initialization started');

    try {
      const macAddress = await window.electronAPI.getMacAddress();
      console.log('MAC Address retrieved:', macAddress);

      const registrationResult = await window.electronAPI.registerDevice(macAddress);
      console.log('Device registration result:', registrationResult);

      if (!registrationResult.success) {
        document.body.innerHTML = `<h1>${registrationResult.message}</h1>`;
        return;
      }

      console.log('Loading chapters...');
      const chapters = await window.electronAPI.loadChapters();

      chapters.forEach((chapter, index) => {
        const button = document.createElement('button');
        button.textContent = chapter.name;
        button.addEventListener('click', () => loadChapter(index));
        chapterContainer.appendChild(button);
      });

      chapterContainer.style.display = 'block';
      loadingElement.classList.add('hidden'); // Hide the loading message once chapters are ready
    } catch (err) {
      console.error('Error during initialization:', err);
      document.body.innerHTML = `<h1>Failed to load video. Please try again.</h1>`;
    }
  }

  async function loadChapter(index) {
    try {
      loadingElement.classList.remove('hidden'); // Show the loading message
      chapterContainer.style.display = 'none'; // Hide the chapter buttons
      videoContainer.style.display = 'none'; // Hide the video container during loading
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load(); // Clear the video buffer

      const chapters = await window.electronAPI.loadChapters();
      const chapter = chapters[index];
      const response = await fetch(`/Volumes/Movies24/.assets/${chapter.file}`);
      if (!response.ok) throw new Error(`Failed to fetch ${chapter.name}`);
      const buffer = await response.arrayBuffer();
	console.log('Buffer size:', buffer.byteLength);
	console.log('Attempting to decrypt the video buffer...');
      const decryptedBuffer = await window.electronAPI.decryptVideoBuffer(buffer);
	console.log('Decrypted buffer size:', decryptedBuffer.byteLength);
	console.log('Creating Blob from decrypted buffer...');
      const blob = new Blob([decryptedBuffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      videoElement.src = url;

      videoElement.oncanplay = () => {
        loadingElement.classList.add('hidden'); // Hide the loading message when ready
        videoContainer.style.display = 'block'; // Show the video container
        videoElement.play();
      };

      videoElement.onerror = () => {
        loadingElement.classList.add('hidden'); // Hide loading message in case of an error
        document.body.innerHTML = `<h1>Failed to load chapter. Please try again.</h1>`;
      };
    } catch (err) {
      console.error('Error loading chapter:', err);
      document.body.innerHTML = `<h1>Failed to load chapter. Please try again.</h1>`;
    }
  }

  backButton.addEventListener('click', () => {
    videoElement.pause();
    videoElement.removeAttribute('src');
    videoElement.load(); // Clear the video buffer

    videoContainer.style.display = 'none';
    chapterContainer.style.display = 'block';
  });

  initialize();

  // Disable the right-click context menu on the video element
  videoElement.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Custom Play Button
  playButton.addEventListener('click', () => {
    videoElement.play();
    playButton.style.display = 'none';
    pauseButton.style.display = 'inline';
  });

  // Custom Pause Button
  pauseButton.addEventListener('click', () => {
    videoElement.pause();
    playButton.style.display = 'inline';
    pauseButton.style.display = 'none';
  });

  // Custom Fullscreen Button
  fullscreenButton.addEventListener('click', () => {
    if (videoElement.requestFullscreen) {
      videoElement.requestFullscreen();
    } else if (videoElement.mozRequestFullScreen) { /* Firefox */
      videoElement.mozRequestFullScreen();
    } else if (videoElement.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
      videoElement.webkitRequestFullscreen();
    } else if (videoElement.msRequestFullscreen) { /* IE/Edge */
      videoElement.msRequestFullscreen();
    }
  });

  // "Back to Beginning" Button
  backToBeginningButton.addEventListener('click', () => {
    videoElement.currentTime = 0;
    videoElement.play(); // Optionally, start playing immediately after resetting to the beginning
  });

  // Hide Pause Button Initially
  playButton.style.display = 'none';

  // Optionally, you can add more custom controls or functionality here
});


