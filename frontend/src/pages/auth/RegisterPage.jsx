import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LuMail, LuLock, LuEye, LuEyeOff, LuUser, LuPhone,
  LuMapPin, LuCircleAlert, LuChevronDown, LuCamera, LuUpload,
  LuIdCard, LuPenLine, LuCheck, LuX, LuRefreshCw, LuLandmark,
  LuChevronLeft, LuChevronRight, LuScanLine, LuArrowLeft,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";
import BrandLogo from "../../components/BrandLogo";
import jsQR from "jsqr";

const PH_BANKS = [
  "AllBank", "Asia United Bank", "Bank of China (Manila)", "Bank of Commerce",
  "Bank of the Philippine Islands (BPI)", "BDO Network Bank", "BDO Unibank",
  "BPI Direct BanKo", "CARD Bank", "Cebuana Lhuillier Rural Bank", "China Bank",
  "China Bank Savings", "City Savings Bank", "Development Bank of the Philippines (DBP)",
  "EastWest Bank", "GoTyme Bank", "Land Bank of the Philippines", "Maya Bank",
  "Maybank Philippines", "Metropolitan Bank and Trust Company (Metrobank)", "Netbank",
  "Overseas Filipino Bank", "Philippine Bank of Communications (PBCOM)",
  "Philippine Business Bank", "Philippine National Bank (PNB)", "Philippine Savings Bank (PSBank)",
  "Philippine Veterans Bank", "Queenbank", "RCBC", "SeaBank Philippines",
  "Security Bank", "Sterling Bank of Asia", "Tonik Digital Bank", "UnionBank of the Philippines",
  "UNO Digital Bank", "Wealth Development Bank", "GCash", "Maya Wallet",
];

const QR_MAX_FILE_SIZE = 5 * 1024 * 1024;
const QR_MAX_PAYLOAD_LENGTH = 4096;
const QR_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const OCR_MAX_IMAGE_DIMENSION = 1024;
const OCR_JPEG_QUALITY = 0.75;

function toTitleCase(value = "") {
  return value
    .trim()
    .toLocaleLowerCase("en-PH")
    .replace(/(^|[^\p{L}\p{N}])\p{L}/gu, match => match.toLocaleUpperCase("en-PH"));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function prepareImageForOcr(photoObj) {
  const source = photoObj.file || photoObj.dataUrl;
  if (!source) throw new Error("The ID photo could not be read.");

  let image;
  try {
    image = await createImageBitmap(source);
  } catch {
    const response = await fetch(photoObj.dataUrl);
    image = await createImageBitmap(await response.blob());
  }

  const scale = Math.min(1, OCR_MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      result => result ? resolve(result) : reject(new Error("The ID photo could not be compressed.")),
      "image/jpeg",
      OCR_JPEG_QUALITY,
    );
  });
  return blobToDataUrl(blob);
}

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 11)].filter(Boolean).join(" ");
}

function parseTlv(value) {
  const fields = {};
  let offset = 0;
  while (offset + 4 <= value.length) {
    const tag = value.slice(offset, offset + 2);
    const lengthText = value.slice(offset + 2, offset + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) break;
    const end = offset + 4 + Number(lengthText);
    if (end > value.length) break;
    fields[tag] = value.slice(offset + 4, end);
    offset = end;
  }
  return fields;
}

function matchBankName(value = "") {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases = {
    bdo: "BDO Unibank", bpi: "Bank of the Philippine Islands (BPI)", metrobank: "Metropolitan Bank and Trust Company (Metrobank)",
    mbtc: "Metropolitan Bank and Trust Company (Metrobank)", pnb: "Philippine National Bank (PNB)",
    rcbc: "RCBC", unionbank: "UnionBank of the Philippines", ubp: "UnionBank of the Philippines",
    landbank: "Land Bank of the Philippines", lbp: "Land Bank of the Philippines", dbp: "Development Bank of the Philippines (DBP)",
    securitybank: "Security Bank", eastwest: "EastWest Bank", chinabank: "China Bank",
    psbank: "Philippine Savings Bank (PSBank)", seabank: "SeaBank Philippines", gotyme: "GoTyme Bank",
    mayabank: "Maya Bank", maya: "Maya Wallet", gcash: "GCash",
  };
  const alias = Object.entries(aliases).find(([key]) => normalized.includes(key));
  if (alias) return alias[1];
  return PH_BANKS.find(bank => normalized.includes(bank.toLowerCase().replace(/[^a-z0-9]/g, ""))) || "";
}

function parseQrBankDetails(payload) {
  if (!payload || payload.length > QR_MAX_PAYLOAD_LENGTH) throw new Error("The QR code contains an oversized or malformed payload.");
  const details = { bankName: "", accountName: "", accountNumber: "" };
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === "object") {
      details.bankName = parsed.bankName || parsed.bank_name || parsed.bank || parsed.institution || "";
      details.accountName = parsed.accountName || parsed.account_name || parsed.accountHolder || parsed.name || "";
      details.accountNumber = parsed.accountNumber || parsed.account_number || parsed.account || parsed.number || "";
    }
  } catch { /* QR payloads are commonly not JSON */ }
  try {
    const params = new URL(payload).searchParams;
    details.bankName ||= params.get("bank_name") || params.get("bank") || "";
    details.accountName ||= params.get("account_name") || params.get("accountHolder") || params.get("name") || "";
    details.accountNumber ||= params.get("account_number") || params.get("account") || params.get("number") || "";
  } catch { /* QR payload may not be a URL */ }
  const labeled = labels => {
    const pattern = labels.map(label => label.replace(/\s+/g, "[ _-]*")).join("|");
    return payload.match(new RegExp(`(?:${pattern})\\s*[:=]\\s*([^;|\\n\\r]+)`, "i"))?.[1]?.trim() || "";
  };
  details.bankName ||= labeled(["bank name", "bank", "institution"]);
  details.accountName ||= labeled(["account holder name", "account name", "holder", "name"]);
  details.accountNumber ||= labeled(["account number", "account no", "account"]);
  const emv = parseTlv(payload);
  details.accountName ||= emv["59"] || "";
  for (let tag = 26; tag <= 51 && !details.accountNumber; tag += 1) {
    const nested = emv[String(tag)] && parseTlv(emv[String(tag)]);
    if (nested) details.accountNumber = nested["01"] || nested["02"] || "";
  }
  details.bankName = matchBankName(details.bankName || payload);
  return details;
}

const GOV_ID_TYPES = [
  "Driver's License",
  "Philippine Passport",
  "SSS ID",
  "GSIS ID",
  "PhilHealth ID",
  "Postal ID",
  "Voter's ID",
  "PhilSys National ID",
  "PRC License",
  "Senior Citizen ID",
  "PWD ID",
  "Other Government ID",
];

// ── Camera capture modal ──────────────────────────────────────────────────────
function CameraModal({ onCapture, onClose, facing = "user", title, instructions }) {
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

// ── Image upload / camera card ────────────────────────────────────────────────
function ImageField({ label, required, hint, preview, onFile, onCamera, accept = "image/*" }) {
  const fileRef = useRef(null);
  return (
    <div>
      <label className="block text-sm font-medium text-brown-dark mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {hint && <p className="text-xs text-brown-light mb-2">{hint}</p>}
      {preview ? (
        <div className="relative rounded-2xl overflow-hidden border-2 border-green-mid/40 mb-2">
          <img src={preview} alt={label} className="w-full object-cover max-h-52" />
          <button type="button" onClick={() => onFile(null)}
            className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center text-red-500 hover:bg-white shadow transition-all">
            <LuX className="w-4 h-4" />
          </button>
          <div className="absolute bottom-2 left-2 bg-green-dark text-white text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
            <LuCheck className="w-3 h-3" /> Photo captured
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed border-beige-dark rounded-2xl p-4 text-center">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button type="button" onClick={() => onCamera()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-semibold text-sm hover:shadow-glow-green transition-all">
              <LuCamera className="w-4 h-4" /> Take Photo
            </button>
            <span className="text-brown-light text-xs">or</span>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
              <LuUpload className="w-4 h-4" /> Upload File
            </button>
          </div>
          <input ref={fileRef} type="file" accept={accept} className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = ev => onFile({ file: f, dataUrl: ev.target.result });
              reader.readAsDataURL(f);
            }}
          />
          <p className="text-xs text-brown-light mt-2">JPEG, PNG or HEIC · max 10 MB</p>
        </div>
      )}
    </div>
  );
}

// ── Step progress indicator ───────────────────────────────────────────────────
const STEPS = [
  { label: "Gov ID",      icon: LuIdCard },
  { label: "Personal",    icon: LuUser },
  { label: "Selfie",      icon: LuCamera },
  { label: "Signature",   icon: LuPenLine },
  { label: "Bank",        icon: LuLandmark },
];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-between mb-8 px-1">
      {STEPS.map((s, i) => {
        const done    = i < current;
        const active  = i === current;
        const Icon    = s.icon;
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all
              ${done   ? "bg-green-dark text-white"
              : active ? "bg-green-pale border-2 border-green-dark text-green-dark"
              : "bg-beige text-brown-light"}`}>
              {done ? <LuCheck className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
            </div>
            <span className={`text-[10px] font-semibold ${active ? "text-green-dark" : done ? "text-green-dark/70" : "text-brown-light"}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`absolute h-0.5 w-full hidden`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main registration page ────────────────────────────────────────────────────
export default function RegisterPage() {
  const navigate = useNavigate();

  // Suppress dark mode on auth pages
  useEffect(() => {
    const prev = document.documentElement.getAttribute("data-theme") ?? "";
    document.documentElement.setAttribute("data-theme", "");
    return () => { if (prev) document.documentElement.setAttribute("data-theme", prev); };
  }, []);

  const [currentStep, setCurrentStep] = useState(0); // 0-4

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", address: "",
    password: "", confirmPassword: "", govIdType: "",
    bankName: "", accountName: "", accountNumber: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);

  const [govIdPhoto,      setGovIdPhoto]      = useState(null);
  const [selfiePhoto,     setSelfiePhoto]     = useState(null);
  const [signaturePhoto,  setSignaturePhoto]  = useState(null);
  const [idExtracting,    setIdExtracting]    = useState(false);
  const [idScanSucceeded, setIdScanSucceeded] = useState(false);
  const [qrDecoding,      setQrDecoding]      = useState(false);
  const qrFileRef = useRef(null);
  const idScanRequestRef = useRef(0);

  const [camera,  setCamera]  = useState(null);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function decodeBankQr(file) {
    setError("");
    if (!QR_IMAGE_TYPES.has(file.type)) {
      setError("Please upload a PNG, JPEG, or WebP QR code image.");
      return;
    }
    if (file.size > QR_MAX_FILE_SIZE) {
      setError("The QR code image must be 5 MB or smaller.");
      return;
    }
    setQrDecoding(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await createImageBitmap(file);
      if (image.width > 4096 || image.height > 4096) {
        image.close();
        throw new Error("The QR image dimensions are too large.");
      }
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      image.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
      if (!result?.data) throw new Error("No readable QR code was found in the image.");
      const details = parseQrBankDetails(result.data);
      if (!details.bankName && !details.accountName && !details.accountNumber) {
        throw new Error("The QR code does not contain recognizable bank account details.");
      }
      setForm(current => ({
        ...current,
        bankName: details.bankName || current.bankName,
        accountName: details.accountName || current.accountName,
        accountNumber: details.accountNumber || current.accountNumber,
      }));
    } catch (qrError) {
      const msg = (typeof qrError?.message === "string" && qrError.message)
        ? qrError.message
        : "The QR code could not be read. Please enter the account details manually.";
      setError(msg);
    } finally {
      URL.revokeObjectURL(objectUrl);
      setQrDecoding(false);
      if (qrFileRef.current) qrFileRef.current.value = "";
    }
  }

  async function extractIdInfo(photoObj) {
    const requestId = ++idScanRequestRef.current;
    setIdExtracting(true);
    setIdScanSucceeded(false);
    setError("");
    try {
      // Preserve the original for registration and send a smaller OCR-only copy.
      // Fall back to the original for formats the browser cannot decode (such as
      // HEIC in some browsers) so preprocessing never prevents the scan itself.
      let dataUrl;
      try {
        dataUrl = await prepareImageForOcr(photoObj);
      } catch {
        dataUrl = photoObj.dataUrl || await blobToDataUrl(photoObj.file);
      }
      const { data, error: fnError } = await supabase.functions.invoke("extract-id-info", {
        body: { image_data_url: dataUrl },
      });
      if (requestId !== idScanRequestRef.current) return;
      // supabase-js buries the response body inside fnError.context for non-2xx returns
      if (fnError) {
        let msg = fnError.message;
        try {
          const body = await fnError.context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        // If the function itself was unreachable, show a simpler message
        if (msg.includes("non-2xx") || msg.includes("Edge Function")) {
          msg = "Smart auto-fill is temporarily unavailable.";
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      if (data?.first_name || data?.last_name || data?.address) {
        setForm(f => ({
          ...f,
          firstName: data.first_name ? toTitleCase(data.first_name) : f.firstName,
          lastName:  data.last_name  ? toTitleCase(data.last_name)  : f.lastName,
          address:   data.address    ? toTitleCase(data.address)    : f.address,
        }));
        setIdScanSucceeded(true);
      } else {
        throw new Error("No readable name or address was found. Try a clearer, closer photo.");
      }
    } catch (err) {
      if (requestId !== idScanRequestRef.current) return;
      setError("Auto-fill unavailable: " + (err?.message || "Unexpected error") + " You can still fill in your details manually.");
    } finally {
      if (requestId === idScanRequestRef.current) setIdExtracting(false);
    }
  }

  function updateGovIdPhoto(photo) {
    idScanRequestRef.current += 1;
    setGovIdPhoto(photo);
    setIdScanSucceeded(false);
    if (photo) extractIdInfo(photo);
    else setIdExtracting(false);
  }

  function fileToDataUrl(fileObj) {
    return new Promise((resolve, reject) => {
      if (fileObj.dataUrl) { resolve(fileObj.dataUrl); return; }
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(fileObj.file);
    });
  }

  // Per-step validation before advancing
  function validateStep(step) {
    setError("");
    if (step === 0) {
      if (!form.govIdType) { setError("Please select your ID type."); return false; }
      if (!govIdPhoto)     { setError("Please provide a photo of your government ID."); return false; }
    }
    if (step === 1) {
      if (!form.firstName.trim()) { setError("First name is required."); return false; }
      if (!form.lastName.trim())  { setError("Last name is required."); return false; }
      if (!form.email.trim())     { setError("Email address is required."); return false; }
      if (!form.phone.trim())     { setError("Contact number is required."); return false; }
      if (form.password.length < 8) { setError("Password must be at least 8 characters."); return false; }
      if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return false; }
    }
    if (step === 2) {
      if (!selfiePhoto) { setError("Please provide a selfie holding your ID."); return false; }
    }
    if (step === 3) {
      if (!signaturePhoto) { setError("Please provide a photo of your handwritten signature."); return false; }
    }
    if (step === 4) {
      if (!form.bankName.trim())      { setError("Bank name is required."); return false; }
      if (!form.accountName.trim())   { setError("Account holder name is required."); return false; }
      if (!form.accountNumber.trim()) { setError("Account number is required."); return false; }
      if (!/^\d+$/.test(form.accountNumber.trim())) {
        setError("Enter a valid bank account number using digits only. Letters, spaces, symbols, and SWIFT/BIC codes are not accepted.");
        return false;
      }
      if (!/^\d{9,18}$/.test(form.accountNumber.trim())) {
        setError("Enter a valid bank account number containing 9 to 18 digits.");
        return false;
      }
    }
    return true;
  }

  function goNext() {
    setError("");
    if (currentStep === 0 && idExtracting) {
      setError("Please wait while your government ID is being scanned.");
      return;
    }
    if (!validateStep(currentStep)) return;
    setCurrentStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setError("");
    setCurrentStep(s => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateStep(4)) return;

    setLoading(true);
    setUploadProgress("Creating account…");

    try {
    const { data, error: authError } = await supabase.auth.signUp({
      email: form.email, password: form.password,
      options: { data: { role: "Supplier" } },
    });
    if (authError) {
      const rawMsg = authError.message ?? "";
      const msg = typeof rawMsg === "string" ? rawMsg.toLowerCase() : "";
      let displayMsg;
      if (!rawMsg || rawMsg === "{}" || rawMsg === "[]" || authError.status >= 500) {
        displayMsg = "Registration failed due to a server error. Please check your internet connection and try again. If the problem persists, the email service may be temporarily unavailable.";
      } else if (msg.includes("already registered") || msg.includes("user already registered")) {
        displayMsg = "An account with this email already exists. Try logging in instead.";
      } else if (msg.includes("invalid email")) {
        displayMsg = "Please enter a valid email address.";
      } else if (msg.includes("password")) {
        displayMsg = "Password does not meet requirements. Please use at least 8 characters.";
      } else {
        displayMsg = typeof rawMsg === "string" ? rawMsg : "Registration failed. Please try again.";
      }
      setError(displayMsg);
      setLoading(false);
      return;
    }
    const userId = data?.user?.id;
    if (!userId) {
      setError("Account creation failed — this email may already be registered, or email confirmation may be pending. Try logging in or use a different email.");
      setLoading(false);
      return;
    }

    let govIdData, faceIdData, esignData;
    try {
      setUploadProgress("Preparing documents…");
      [govIdData, faceIdData, esignData] = await Promise.all([
        fileToDataUrl(govIdPhoto),
        fileToDataUrl(selfiePhoto),
        fileToDataUrl(signaturePhoto),
      ]);
    } catch {
      setError("Failed to read photo files. Please try again.");
      setLoading(false); return;
    }

    try {
      setUploadProgress("Uploading documents…");
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("upload-registration-files", {
        body: {
          user_id:        userId,
          first_name:     form.firstName.trim(),
          last_name:      form.lastName.trim(),
          phone:          form.phone.trim() || null,
          address:        form.address.trim() || null,
          gov_id_type:    form.govIdType,
          gov_id_data:    govIdData,
          face_id_data:   faceIdData,
          esign_data:     esignData,
          bank_name:      form.bankName.trim(),
          account_name:   form.accountName.trim(),
          account_number: form.accountNumber.trim(),
        },
      });

      if (fnErr || fnData?.error) {
        // Log the raw values so we can debug any unexpected shapes
        console.error("[register] upload error — fnData:", fnData, "fnErr:", fnErr);

        // Try to read the actual error message from the edge function's JSON response body
        let errMsg = "";
        if (typeof fnData?.error === "string" && fnData.error) {
          errMsg = fnData.error;
        } else if (fnErr) {
          try {
            const body = await fnErr.context?.json?.();
            console.error("[register] fnErr response body:", body);
            errMsg = typeof body?.error === "string" ? body.error : "";
          } catch { /* response body couldn't be parsed */ }
          if (!errMsg) errMsg = fnErr.message || "";
        }
        // Sign out so the partially-created auth user doesn't block a retry with the same email
        await supabase.auth.signOut();
        setError(errMsg || "Document upload failed. Please try again with the same email.");
        setLoading(false);
        return;
      }
    } catch (uploadErr) {
      console.error("[register] unexpected upload error:", uploadErr);
      // Sign out so the partially-created auth user doesn't block a retry with the same email
      await supabase.auth.signOut();
      setError(uploadErr?.message || "An error occurred uploading your documents. Please try again.");
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    navigate("/pending-approval");
    } catch (unexpectedErr) {
      setError("An unexpected error occurred: " + (unexpectedErr?.message ?? "Please try again."));
      setLoading(false);
    }
  }

  const inputClass = `w-full py-2.5 rounded-xl border border-beige-dark bg-white/70
    text-brown-dark placeholder-brown-light/50 text-sm
    focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid
    transition-all duration-200`;

  // ── Uploading overlay ────────────────────────────────────────────────────
  if (loading) {
    const steps = ["Creating account…", "Preparing documents…", "Uploading documents…"];
    const stepIndex = steps.indexOf(uploadProgress);
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-pale via-cream to-beige flex items-center justify-center px-4">
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 w-80 h-80 bg-green-light/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-green-mid/10 rounded-full blur-3xl" />
        </div>

        <div className="relative bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/60 px-10 py-12 text-center max-w-xs w-full">
          {/* Animated logo ring */}
          <div className="relative w-20 h-20 mx-auto mb-7">
            <svg className="absolute inset-0 w-full h-full animate-spin" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="36" fill="none" stroke="#e8f5e9" strokeWidth="6" />
              <circle cx="40" cy="40" r="36" fill="none" stroke="#1b5e20" strokeWidth="6"
                strokeDasharray="226" strokeDashoffset="170" strokeLinecap="round" />
            </svg>
            <div className="absolute inset-[10px] bg-gradient-to-br from-green-dark to-green-mid rounded-2xl flex items-center justify-center shadow-lg">
              <BrandLogo className="w-8 h-8" size="100%" />
            </div>
          </div>

          <h2 className="text-lg font-bold text-brown-dark mb-1">Submitting your registration…</h2>
          <p className="text-sm text-brown-light mb-6">{uploadProgress || "Please wait…"}</p>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-2">
            {steps.map((s, i) => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${
                i < stepIndex ? "w-6 bg-green-dark" :
                i === stepIndex ? "w-8 bg-green-dark animate-pulse" :
                "w-4 bg-beige-dark/40"
              }`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Step content ─────────────────────────────────────────────────────────
  function renderStep() {
    switch (currentStep) {

      // STEP 1 — Government ID
      case 0: return (
        <div className="space-y-5">
          <div className="flex items-start gap-3 bg-green-pale/60 border border-green-light/40 rounded-2xl px-4 py-3">
            <LuScanLine className="w-4 h-4 text-green-dark shrink-0 mt-0.5" />
            <p className="text-xs text-green-dark leading-relaxed">
              <span className="font-semibold">Smart auto-fill:</span> Upload your ID and CopTrax will automatically read and fill in your name and address in the next step.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">
              ID type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <LuChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
              <select value={form.govIdType} onChange={set("govIdType")}
                className={`${inputClass} pl-4 pr-10 appearance-none`}>
                <option value="">Select ID type…</option>
                {GOV_ID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <ImageField
            label="Front of your government ID"
            required
            hint="Make sure all text on your ID is clearly visible. Lay the ID flat and take the photo in good lighting."
            preview={govIdPhoto?.dataUrl ?? null}
            onFile={updateGovIdPhoto}
            onCamera={() => setCamera({
              facing: "environment",
              title: "Photograph your Government ID",
              instructions: "Place your ID on a flat surface in good lighting. Make sure all four corners are visible and the text is sharp.",
              onCapture: updateGovIdPhoto,
            })}
          />
          {idExtracting && (
            <div className="flex items-center gap-2 text-xs text-green-dark animate-pulse">
              <div className="w-3.5 h-3.5 border-2 border-green-dark border-t-transparent rounded-full animate-spin" />
              Reading your ID… your details will be filled in automatically
            </div>
          )}
          {govIdPhoto && !idExtracting && idScanSucceeded && (
            <div className="flex items-center gap-2 text-xs text-green-dark">
              <LuCheck className="w-3.5 h-3.5" />
              ID scanned — your information will be pre-filled in the next step
            </div>
          )}
        </div>
      );

      // STEP 2 — Personal Information
      case 1: return (
        <div className="space-y-4">
          {(form.firstName || form.lastName || form.address) && (
            <div className="flex items-start gap-3 bg-green-pale/60 border border-green-light/40 rounded-2xl px-4 py-3">
              <LuScanLine className="w-4 h-4 text-green-dark shrink-0 mt-0.5" />
              <p className="text-xs text-green-dark leading-relaxed">
                <span className="font-semibold">Auto-filled from your ID.</span> Please review and correct if needed.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                First name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <LuUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                <input type="text" value={form.firstName} onChange={set("firstName")}
                  placeholder="Juan" className={`${inputClass} pl-10`} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1.5">
                Last name <span className="text-red-500">*</span>
              </label>
              <input type="text" value={form.lastName} onChange={set("lastName")}
                placeholder="dela Cruz" className={`${inputClass} px-4`} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">
              Email address <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <LuMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input type="email" value={form.email} onChange={set("email")}
                placeholder="you@example.com" className={`${inputClass} pl-10`} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">Phone number</label>
            <div className="relative">
              <LuPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input type="tel" inputMode="numeric" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: formatPhoneNumber(e.target.value) }))}
                placeholder="0917 123 4567" maxLength={13} className={`${inputClass} pl-10`} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">Address</label>
            <div className="relative">
              <LuMapPin className="absolute left-3.5 top-3 w-4 h-4 text-brown-light" />
              <textarea rows={2} value={form.address} onChange={set("address")}
                placeholder="Barangay, Municipality, Province"
                className={`${inputClass} pl-10 resize-none`} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <LuLock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input type={showPassword ? "text" : "password"} value={form.password} onChange={set("password")}
                placeholder="Min. 8 characters" className={`${inputClass} pl-10 pr-10`} />
              <button type="button" onClick={() => setShowPassword(p => !p)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
                {showPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">
              Confirm password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <LuLock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
              <input type={showConfirm ? "text" : "password"} value={form.confirmPassword} onChange={set("confirmPassword")}
                placeholder="Re-enter password" className={`${inputClass} pl-10 pr-10`} />
              <button type="button" onClick={() => setShowConfirm(p => !p)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
                {showConfirm ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      );

      // STEP 3 — Selfie with ID
      case 2: return (
        <div className="space-y-4">
          <div className="bg-beige rounded-2xl px-4 py-3 text-xs text-brown-mid">
            Take a clear photo of yourself holding your government ID beside your face. Both your face and the ID must be visible and legible.
          </div>
          <ImageField
            label="Selfie holding your government ID"
            required
            preview={selfiePhoto?.dataUrl ?? null}
            onFile={v => setSelfiePhoto(v)}
            onCamera={() => setCamera({
              facing: "user",
              title: "Selfie holding your Government ID",
              instructions: "Hold your government ID clearly beside your face. Make sure your face and the ID text are both visible and in focus.",
              onCapture: v => setSelfiePhoto(v),
            })}
          />
        </div>
      );

      // STEP 4 — E-Signature
      case 3: return (
        <div className="space-y-4">
          <div className="bg-beige rounded-2xl px-4 py-4 space-y-2">
            <p className="text-sm font-semibold text-brown-dark">How to prepare your signature:</p>
            <ol className="text-xs text-brown-mid space-y-1.5 list-decimal list-inside">
              <li>Use a plain <strong>white sheet of bond paper</strong> (any size).</li>
              <li>Write your <strong>full signature</strong> using a black or blue pen.</li>
              <li>Make sure your signature is clearly written and not cut off.</li>
              <li>Place the paper on a flat, well-lit surface.</li>
              <li>Take a clear, straight-on photo — avoid shadows and blurriness.</li>
            </ol>
            <div className="mt-3 border border-beige-dark rounded-xl px-4 py-3 bg-white text-xs text-brown-light text-center italic">
              Your handwritten signature will be used on all contracts you sign in CopTrax
            </div>
          </div>
          <ImageField
            label="Photo of your handwritten signature on a white sheet of paper"
            required
            preview={signaturePhoto?.dataUrl ?? null}
            onFile={v => setSignaturePhoto(v)}
            onCamera={() => setCamera({
              facing: "environment",
              title: "Photograph your Signature Sheet",
              instructions: "Point the camera at the white paper with your signature. Make sure it is fully visible, well-lit, and in focus.",
              onCapture: v => setSignaturePhoto(v),
            })}
          />
        </div>
      );

      // STEP 5 — Bank Account
      case 4: return (
        <div className="space-y-4">
          <p className="text-xs text-brown-light">
            This account will receive electronic payments after every accepted delivery.
          </p>
          <div className="rounded-2xl border border-beige-dark bg-beige/50 p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-pale text-green-dark flex items-center justify-center shrink-0">
                <LuScanLine className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-brown-dark">Auto-fill from a bank QR code</p>
                <p className="text-xs text-brown-light mt-0.5">Decoded privately in your browser. The image and QR contents are never uploaded or saved.</p>
                <button type="button" disabled={qrDecoding} onClick={() => qrFileRef.current?.click()}
                  className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl border border-beige-dark bg-white text-brown-mid font-semibold text-xs hover:bg-green-pale disabled:opacity-50 transition-all">
                  {qrDecoding ? <LuRefreshCw className="w-4 h-4 animate-spin" /> : <LuUpload className="w-4 h-4" />}
                  {qrDecoding ? "Reading QR code…" : "Upload QR image"}
                </button>
                <input ref={qrFileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={e => { const file = e.target.files?.[0]; if (file) decodeBankQr(file); }} />
                <p className="text-[11px] text-brown-light mt-2">PNG, JPEG, or WebP · max 5 MB</p>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">
              Bank name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select value={form.bankName} onChange={set("bankName")} className={`${inputClass} px-4 pr-10 appearance-none`}>
                <option value="">Select a bank</option>
                {PH_BANKS.map(bank => <option key={bank} value={bank}>{bank}</option>)}
              </select>
              <LuChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">
              Account holder name <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.accountName} onChange={set("accountName")}
              placeholder="Exactly as it appears on the account" className={`${inputClass} px-4`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1.5">
              Account number <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.accountNumber} onChange={set("accountNumber")}
              placeholder="e.g. 001234567890" className={`${inputClass} px-4`} />
          </div>
        </div>
      );

      default: return null;
    }
  }

  const stepTitles = [
    "Government ID",
    "Personal Information",
    "Selfie with ID",
    "E-Signature",
    "Bank Account",
  ];
  const stepSubtitles = [
    "Upload your ID — we'll read and fill in your details automatically",
    "Review and complete your personal details",
    "Take a selfie holding your government ID",
    "Provide a photo of your handwritten signature",
    "Where you'll receive your payments",
  ];

  return (
    <>
      {camera && (
        <CameraModal
          facing={camera.facing}
          title={camera.title}
          instructions={camera.instructions}
          onCapture={camera.onCapture}
          onClose={() => setCamera(null)}
        />
      )}

      <div className="min-h-screen bg-gradient-to-br from-green-pale via-cream to-beige flex items-center justify-center px-4 py-12">
        <Link to="/" aria-label="Back to homepage"
          className="fixed top-5 left-5 z-20 flex items-center gap-2 rounded-xl border border-beige-dark bg-white/85 px-3.5 py-2 text-sm font-semibold text-brown-mid shadow-sm backdrop-blur hover:bg-white hover:text-green-dark transition-all">
          <LuArrowLeft className="w-4 h-4 text-green-dark" />
        </Link>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-green-light/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-green-mid/10 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-lg">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-gradient-to-br from-green-dark to-green-light rounded-2xl flex items-center justify-center shadow-lg mb-3 p-2">
              <BrandLogo className="w-full h-full" size="100%" />
            </div>
            <h1 className="text-2xl font-extrabold text-green-dark tracking-tight">CopTrax</h1>
            <p className="text-brown-light text-sm mt-1">Supplier Registration — NERC Copra Trading</p>
          </div>

          {/* Card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-card border border-white/60 p-8">

            {/* Step indicator */}
            <StepIndicator current={currentStep} />

            {/* Step title */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-brown-light uppercase tracking-widest">
                  Step {currentStep + 1} of {STEPS.length}
                </span>
              </div>
              <h2 className="text-xl font-bold text-brown-dark">{stepTitles[currentStep]}</h2>
              <p className="text-brown-light text-sm mt-0.5">{stepSubtitles[currentStep]}</p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm mb-5">
                <LuCircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{typeof error === "string" ? error : "An unexpected error occurred. Please try again."}</span>
              </div>
            )}

            {/* Step content */}
            <form onSubmit={handleSubmit}>
              {renderStep()}

              {/* Navigation buttons */}
              <div className="flex gap-3 mt-7">
                {currentStep > 0 && (
                  <button type="button" onClick={goBack}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-beige-dark text-brown-mid font-semibold text-sm hover:bg-beige transition-all">
                    <LuChevronLeft className="w-4 h-4" /> Back
                  </button>
                )}
                {currentStep < STEPS.length - 1 ? (
                  <button type="button" onClick={goNext} disabled={currentStep === 0 && idExtracting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green disabled:opacity-60 disabled:cursor-wait transition-all">
                    {currentStep === 0 && idExtracting ? "Scanning ID…" : <>Next <LuChevronRight className="w-4 h-4" /></>}
                  </button>
                ) : (
                  <button type="submit"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-green-dark to-green-mid text-white font-bold text-sm hover:shadow-glow-green transition-all">
                    <LuCheck className="w-4 h-4" /> Submit Registration
                  </button>
                )}
              </div>
            </form>

            <p className="text-center text-sm text-brown-light mt-6">
              Already have an account?{" "}
              <Link to="/login" className="text-green-mid font-semibold hover:text-green-dark transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

