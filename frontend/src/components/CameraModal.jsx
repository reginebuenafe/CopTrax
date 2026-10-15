import { useEffect, useRef, useState } from "react";
import { LuCamera, LuX, LuCircleAlert, LuRefreshCw, LuCheck } from "react-icons/lu";

/**
 * CameraModal — shared live-camera capture UI (getUserMedia + canvas
 * snapshot). Originally built for Supplier registration (Gov ID selfie /
 * signature photo capture); extracted here so any page can reuse the exact
 * same camera-capture experience instead of duplicating it.
 *
 * Props:
 *   onCapture(photo)  – called with { file, dataUrl } once the user confirms
 *   onClose()         – called to dismiss the modal (capture or cancel)
 *   facing            – "user" (front camera) | "environment" (back camera)
 *   title             – modal header text
 *   instructions      – optional helper text shown above the camera view
 */
export default function CameraModal({ onCapture, onClose, facing = "user", title, instructions }) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const [ready,    setReady]    = useState(false);
  const [captured, setCaptured] = useState(null);
  const [camErr,   setCamErr]   = useState("");

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setReady(true);
        }
      } catch {
        setCamErr("Could not access camera. Please allow camera access or use the upload option.");
      }
    }
    startCamera();
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [facing]);

  function capture() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCaptured(dataUrl);
  }

  function retake() { setCaptured(null); }

  function confirm() {
    const arr  = captured.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    const file = new File([u8arr], `capture-${Date.now()}.jpg`, { type: mime });
    onCapture({ file, dataUrl: captured });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-3xl shadow-card w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-beige-dark/20">
          <div className="flex items-center gap-2">
            <LuCamera className="w-4 h-4 text-green-dark" />
            <h3 className="font-bold text-brown-dark text-sm">{title}</h3>
          </div>
          <button onClick={onClose} className="text-brown-light hover:text-brown-dark transition-colors">
            <LuX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          {instructions && (
            <div className="bg-beige rounded-xl px-4 py-3 text-xs text-brown-mid mb-4">{instructions}</div>
          )}
          {camErr ? (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <LuCircleAlert className="w-4 h-4 shrink-0 mt-0.5" />{camErr}
            </div>
          ) : (
            <>
              <div className="relative bg-black rounded-2xl overflow-hidden mb-4" style={{ aspectRatio: "16/9" }}>
                {!captured
                  ? <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                  : <img src={captured} alt="Captured" className="w-full h-full object-cover" />}
                {!ready && !captured && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </>
          )}
          {!camErr && (
            <div className="flex gap-3">
              {!captured ? (
                <button onClick={capture} disabled={!ready}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm disabled:opacity-50 hover:shadow-glow-green transition-all">
                  <LuCamera className="w-4 h-4" /> Capture Photo
                </button>
              ) : (
                <>
                  <button onClick={retake}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
                    <LuRefreshCw className="w-4 h-4" /> Retake
                  </button>
                  <button onClick={confirm}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green transition-all">
                    <LuCheck className="w-4 h-4" /> Use Photo
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
