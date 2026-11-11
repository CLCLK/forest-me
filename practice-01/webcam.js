"use strict";

const webcam = (() => {
  const video = document.getElementById("camera-video");
  const faceCanvas = document.getElementById("face");
  const faceContext = faceCanvas.getContext("2d");
  const preview = document.getElementById("face-preview");
  const previewContext = preview.getContext("2d");
  const previewPlaceholder = document.getElementById("preview-placeholder");
  const onButton = document.getElementById("camera-on");
  const offButton = document.getElementById("camera-off");
  const status = document.getElementById("camera-status");
  const zoomInput = document.getElementById("face-zoom");
  const zoomValue = document.getElementById("zoom-value");
  const analysis = document.createElement("canvas");
  const analysisContext = analysis.getContext("2d");
  let stream = null;
  let detector = null;
  let detectorPromise = null;
  let requestId = 0;
  let trackedFace = null;
  let lastDetection = -Infinity;
  let lastSeen = -Infinity;
  let lastVideoTime = -1;
  let lastPaintTime = -1;

  function setStatus(text) {
    if (status.textContent !== text) status.textContent = text;
  }

  function loadDetector() {
    if (detector) return Promise.resolve(detector);
    if (!detectorPromise) {
      detectorPromise = (async () => {
        const { FaceDetector, FilesetResolver } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs");
        const files = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm");
        detector = await FaceDetector.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: .45,
        });
        return detector;
      })().catch(error => {
        detectorPromise = null;
        throw error;
      });
    }
    return detectorPromise;
  }

  function stop(message = "웹캠을 껐어요. 요정은 계속 마우스를 따라와요.") {
    requestId++;
    const previousStream = stream;
    stream = null;
    if (previousStream) previousStream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    trackedFace = null;
    faceContext.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
    faceCanvas.hidden = true;
    previewContext.clearRect(0, 0, preview.width, preview.height);
    previewPlaceholder.hidden = false;
    onButton.disabled = false;
    offButton.disabled = true;
    lastVideoTime = lastPaintTime = -1;
    setStatus(message);
  }

  async function start() {
    const id = ++requestId;
    onButton.disabled = true;
    offButton.disabled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      stop("Chrome·Edge에서 localhost 주소로 열어주세요.");
      return;
    }
    setStatus("카메라 사용 권한을 허용해주세요.");
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (id !== requestId) {
        acquired.getTracks().forEach(track => track.stop());
        return;
      }
      stream = acquired;
      acquired.getVideoTracks()[0].addEventListener("ended", () => {
        if (stream === acquired) stop("카메라 연결이 끊어졌어요. 다시 켜주세요.");
      });
      video.srcObject = acquired;
      await video.play();
      if (id !== requestId) return;
      lastDetection = lastSeen = -Infinity;
      lastVideoTime = lastPaintTime = -1;
      setStatus("웹캠 연결됨 · 미리보기에 얼굴을 맞춰주세요.");
      startAnimation();
      update(performance.now());
      // Camera compositing works immediately, even while the optional model loads.
      loadDetector().catch(() => {
        if (id === requestId) setStatus("자동 인식 없이도 합성 중이에요. 미리보기와 확대를 맞춰주세요.");
      });
    } catch (error) {
      if (id !== requestId) return;
      const messages = {
        NotAllowedError: "카메라 권한이 필요해요. 브라우저에서 허용한 뒤 다시 켜주세요.",
        NotFoundError: "연결된 웹캠을 찾을 수 없어요.",
        NotReadableError: "다른 앱이 웹캠을 사용 중인지 확인해주세요.",
      };
      stop(messages[error.name] || "얼굴 인식을 준비하지 못했어요. 인터넷 연결을 확인하고 다시 켜주세요.");
    }
  }

  function update(time) {
    if (!stream || video.readyState < 2 || !video.videoWidth) return;
    if (detector && time - lastDetection >= 120 && video.currentTime !== lastVideoTime) {
      lastDetection = time;
      lastVideoTime = video.currentTime;
      if (analysis.width !== 384 || analysis.height !== Math.round(384 * video.videoHeight / video.videoWidth)) {
        analysis.width = 384;
        analysis.height = Math.round(384 * video.videoHeight / video.videoWidth);
      }
      analysisContext.drawImage(video, 0, 0, analysis.width, analysis.height);
      let detections = [];
      try {
        detections = detector.detectForVideo(analysis, time).detections;
      } catch {
        detector = null;
        setStatus("수동 얼굴 맞춤으로 합성 중이에요. 미리보기를 확인해주세요.");
      }
      const selected = detections.reduce((best, face) => !best || face.boundingBox.width * face.boundingBox.height > best.boundingBox.width * best.boundingBox.height ? face : best, null);
      if (selected) {
        const b = selected.boundingBox;
        const factor = video.videoWidth / analysis.width;
        const eyes = selected.keypoints.slice(0, 2).sort((a, b) => a.x - b.x);
        const next = {
          cx: (b.originX + b.width / 2) * factor,
          cy: (b.originY + b.height * .48) * factor,
          width: b.width * factor,
          height: b.height * factor,
          angle: Math.atan2((eyes[1].y - eyes[0].y) * video.videoHeight, (eyes[1].x - eyes[0].x) * video.videoWidth),
        };
        if (!trackedFace || time - lastSeen > 600) trackedFace = next;
        else for (const key of Object.keys(next)) trackedFace[key] += (next[key] - trackedFace[key]) * .4;
        lastSeen = time;
        setStatus("얼굴을 자동으로 맞췄어요. 확대 슬라이더로 조절해보세요.");
      }
    }
    if (!trackedFace || time - lastSeen > 600) {
      // A centered crop keeps the user's video visible if detection is unavailable.
      trackedFace = null;
    }
    if (lastPaintTime === video.currentTime) return;
    lastPaintTime = video.currentTime;
    const w = faceCanvas.width;
    const h = faceCanvas.height;
    const face = trackedFace || {
      cx: video.videoWidth / 2,
      cy: video.videoHeight * .46,
      width: video.videoHeight * .42,
      height: video.videoHeight * .58,
      angle: 0,
    };
    const cropHeight = Math.max(face.height * 1.08, face.width * 1.04 / (w / h)) / Number(zoomInput.value);
    const scale = h / cropHeight;
    faceContext.clearRect(0, 0, w, h);
    faceContext.save();
    faceContext.translate(w / 2, h / 2);
    faceContext.scale(-scale, scale);
    faceContext.rotate(-face.angle);
    faceContext.drawImage(video, -face.cx, -face.cy);
    faceContext.restore();
    faceCanvas.hidden = false;
    previewContext.clearRect(0, 0, preview.width, preview.height);
    previewContext.drawImage(faceCanvas, 0, 0, preview.width, preview.height);
    previewPlaceholder.hidden = true;
  }

  zoomInput.addEventListener("input", () => {
    const value = `${Number(zoomInput.value).toFixed(2)}배`;
    zoomValue.value = value;
    zoomInput.setAttribute("aria-valuetext", value);
    lastPaintTime = -1;
  });
  onButton.addEventListener("click", start);
  offButton.addEventListener("click", () => stop());
  window.addEventListener("pagehide", () => stop());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (stream || onButton.disabled)) stop("화면을 떠나 웹캠을 껐어요. 다시 켜서 이어가세요.");
  });

  return { update, get active() { return stream !== null; } };
})();
