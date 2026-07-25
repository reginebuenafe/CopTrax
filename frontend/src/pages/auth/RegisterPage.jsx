import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LuLeaf, LuMail, LuLock, LuEye, LuEyeOff, LuUser, LuPhone,
  LuMapPin, LuCircleAlert, LuChevronDown, LuCamera, LuUpload,
  LuIdCard, LuPenLine, LuCheck, LuX, LuRefreshCw,
} from "react-icons/lu";
import { supabase } from "../../lib/supabase";

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
    // Convert dataURL to File
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-beige-dark/20">
          <div className="flex items-center gap-2">
            <LuCamera className="w-4 h-4 text-green-dark" />
            <h3 className="font-bold text-brown-dark text-sm">{title}</h3>
          </div>
          <button onClick={onClose} className="text-brown-light hover:text-brown-dark transition-colors">
            <LuX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {instructions && (
            <div className="bg-beige rounded-xl px-4 py-3 text-xs text-brown-mid mb-4">
              {instructions}
            </div>
          )}

          {camErr ? (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <LuCircleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              {camErr}
            </div>
          ) : (
            <>
              <div className="relative bg-black rounded-2xl overflow-hidden mb-4" style={{ aspectRatio: "16/9" }}>
                {!captured ? (
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                ) : (
                  <img src={captured} alt="Captured" className="w-full h-full object-cover" />
                )}
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
function ImageField({ label, required, hint, preview, onFile, onCamera, cameraFacing, cameraTitle, cameraInstructions, accept = "image/*" }) {
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

// ── Main registration page ────────────────────────────────────────────────────
export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    password: "",
    confirmPassword: "",
    govIdType: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);

  // File state: each entry is { file: File, dataUrl: string } | null
  const [govIdPhoto,   setGovIdPhoto]   = useState(null);
  const [selfiePhoto,  setSelfiePhoto]  = useState(null);
  const [signaturePhoto, setSignaturePhoto] = useState(null);

  // Camera modal state
  const [camera, setCamera] = useState(null); // { facing, title, instructions, onCapture }

  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [step,    setStep]    = useState("form"); // "form" | "uploading" | "done"
  const [uploadProgress, setUploadProgress] = useState("");

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function uploadFile(userId, fileObj, category, filename) {
    const path = `${userId}/${category}-${Date.now()}-${filename}`;
    const { data: storageData, error: storageErr } = await supabase.storage
      .from("documents")
      .upload(path, fileObj.file, { upsert: false });

    if (storageErr) throw new Error(`Upload failed (${category}): ${storageErr.message}`);

    const { data: fileRecord, error: dbErr } = await supabase
      .from("file_uploads")
      .insert({
        uploaded_by:   userId,
        file_category: category,
        file_name:     filename,
        file_url:      storageData.path,
        file_size:     fileObj.file.size,
      })
      .select("file_id")
      .single();

    if (dbErr) throw new Error(`File record failed (${category}): ${dbErr.message}`);
    return fileRecord.file_id;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Validation
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
    if (!form.govIdType) { setError("Please select the type of your government ID."); return; }
    if (!govIdPhoto)     { setError("Please provide a photo of your government ID."); return; }
    if (!selfiePhoto)    { setError("Please provide a photo of yourself holding your government ID."); return; }
    if (!signaturePhoto) { setError("Please provide a photo of your handwritten e-signature."); return; }

    setLoading(true);
    setStep("uploading");

    // 1. Create auth user
    setUploadProgress("Creating account…");
    const { data, error: authError } = await supabase.auth.signUp({
      email:    form.email,
      password: form.password,
      options:  { data: { role: "Supplier" } },
    });

    if (authError) { setError(authError.message); setLoading(false); setStep("form"); return; }
    const userId = data.user.id;

    // 2. Update profile
    setUploadProgress("Saving profile…");
    const { error: profileError } = await supabase.from("users").update({
      first_name: form.firstName.trim(),
      last_name:  form.lastName.trim(),
      phone:      form.phone.trim() || null,
      address:    form.address.trim() || null,
    }).eq("user_id", userId);

    if (profileError) {
      setError("Profile update failed. Please contact support.");
      setLoading(false); setStep("form"); return;
    }

    // 3. Upload files
    try {
      setUploadProgress("Uploading government ID photo…");
      const govIdFileId = await uploadFile(userId, govIdPhoto, "Gov ID", `gov-id.jpg`);

      setUploadProgress("Uploading selfie with ID…");
      const faceIdFileId = await uploadFile(userId, selfiePhoto, "Face ID", `face-id.jpg`);

      setUploadProgress("Uploading e-signature photo…");
      const esignFileId = await uploadFile(userId, signaturePhoto, "E-Sign", `esign.jpg`);

      // Also upload face ID to file_uploads (it links via uploaded_by only — user_verify tracks gov_id + esign)
      // 4. Create user_verify record
      setUploadProgress("Submitting verification request…");
      await supabase.from("user_verify").insert({
        user_id:        userId,
        gov_id_file_id: govIdFileId,
        esign_file_id:  esignFileId,
        verify_status:  "Pending",
      });

      // Face ID stored in file_uploads with category 'Face ID' — BO can retrieve via uploaded_by
      // (user_verify table doesn't have a face_id column — linked implicitly)
      void faceIdFileId;

    } catch (uploadErr) {
      setError(uploadErr.message);
      setLoading(false); setStep("form"); return;
    }

    // 5. Sign out and redirect
    await supabase.auth.signOut();
    setLoading(false);
    navigate("/pending-approval");
  }

  const inputClass = `w-full py-2.5 rounded-xl border border-beige-dark bg-white/70
    text-brown-dark placeholder-brown-light/50 text-sm
    focus:outline-none focus:ring-2 focus:ring-green-mid/30 focus:border-green-mid
    transition-all duration-200`;

  if (step === "uploading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-pale via-cream to-beige flex items-center justify-center px-4">
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-card border border-white/60 p-10 text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-green-pale rounded-2xl flex items-center justify-center mx-auto mb-5">
            <div className="w-8 h-8 border-3 border-green-dark border-t-transparent rounded-full animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-brown-dark mb-2">Submitting your registration…</h2>
          <p className="text-sm text-brown-light">{uploadProgress}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Camera modal */}
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
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-green-light/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-green-mid/10 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-lg">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-gradient-to-br from-green-dark to-green-light rounded-2xl flex items-center justify-center shadow-lg mb-3">
              <LuLeaf className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-green-dark tracking-tight">CopTrax</h1>
            <p className="text-brown-light text-sm mt-1">Supplier Registration — NERC Copra Trading</p>
          </div>

          {/* Card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-card border border-white/60 p-8 space-y-8">
            <div>
              <h2 className="text-xl font-bold text-brown-dark mb-1">Create supplier account</h2>
              <p className="text-brown-light text-sm">
                Your account will be reviewed by NERC before you can log in.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-sm">
                <LuCircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* ── Section 1: Personal Info ─────────────────────── */}
              <section>
                <h3 className="text-xs font-bold text-brown-light uppercase tracking-widest mb-4">
                  Personal Information
                </h3>
                <div className="space-y-4">
                  {/* Name */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-brown-dark mb-1.5">
                        First name <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <LuUser className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                        <input type="text" required value={form.firstName} onChange={set("firstName")}
                          placeholder="Juan" className={`${inputClass} pl-10`} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-brown-dark mb-1.5">
                        Last name <span className="text-red-500">*</span>
                      </label>
                      <input type="text" required value={form.lastName} onChange={set("lastName")}
                        placeholder="dela Cruz" className={`${inputClass} px-4`} />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-brown-dark mb-1.5">
                      Email address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <LuMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                      <input type="email" required value={form.email} onChange={set("email")}
                        placeholder="you@example.com" className={`${inputClass} pl-10`} />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-medium text-brown-dark mb-1.5">Phone number</label>
                    <div className="relative">
                      <LuPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                      <input type="tel" value={form.phone} onChange={set("phone")}
                        placeholder="+63 9XX XXX XXXX" className={`${inputClass} pl-10`} />
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-sm font-medium text-brown-dark mb-1.5">Address</label>
                    <div className="relative">
                      <LuMapPin className="absolute left-3.5 top-3 w-4 h-4 text-brown-light" />
                      <textarea rows={2} value={form.address} onChange={set("address")}
                        placeholder="Barangay, Municipality, Province"
                        className={`${inputClass} pl-10 resize-none`} />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-medium text-brown-dark mb-1.5">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <LuLock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                      <input type={showPassword ? "text" : "password"} required
                        value={form.password} onChange={set("password")}
                        placeholder="Min. 8 characters" className={`${inputClass} pl-10 pr-10`} />
                      <button type="button" onClick={() => setShowPassword(p => !p)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
                        {showPassword ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-sm font-medium text-brown-dark mb-1.5">
                      Confirm password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <LuLock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light" />
                      <input type={showConfirm ? "text" : "password"} required
                        value={form.confirmPassword} onChange={set("confirmPassword")}
                        placeholder="Re-enter password" className={`${inputClass} pl-10 pr-10`} />
                      <button type="button" onClick={() => setShowConfirm(p => !p)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brown-light hover:text-brown-dark transition-colors">
                        {showConfirm ? <LuEyeOff className="w-4 h-4" /> : <LuEye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Section 2: Government ID ─────────────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <LuIdCard className="w-4 h-4 text-green-dark" />
                  <h3 className="text-xs font-bold text-brown-light uppercase tracking-widest">
                    Government-Issued ID
                  </h3>
                </div>

                <div className="space-y-4">
                  {/* ID type */}
                  <div>
                    <label className="block text-sm font-medium text-brown-dark mb-1.5">
                      ID type <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <LuChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-light pointer-events-none" />
                      <select required value={form.govIdType} onChange={set("govIdType")}
                        className={`${inputClass} pl-4 pr-10 appearance-none`}>
                        <option value="">Select ID type…</option>
                        {GOV_ID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Gov ID photo */}
                  <ImageField
                    label="Photo of your government ID"
                    required
                    hint="Make sure all text on your ID is clearly visible. Lay the ID flat and take the photo in good lighting."
                    preview={govIdPhoto?.dataUrl ?? null}
                    onFile={v => setGovIdPhoto(v)}
                    onCamera={() => setCamera({
                      facing: "environment",
                      title: "Photograph your Government ID",
                      instructions: "Place your ID on a flat surface in good lighting. Make sure all four corners are visible and the text is sharp.",
                      onCapture: v => setGovIdPhoto(v),
                    })}
                  />
                </div>
              </section>

              {/* ── Section 3: Selfie with ID ────────────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-1">
                  <LuCamera className="w-4 h-4 text-green-dark" />
                  <h3 className="text-xs font-bold text-brown-light uppercase tracking-widest">
                    Photo Holding Your ID
                  </h3>
                </div>
                <p className="text-xs text-brown-light mb-4">
                  Take a clear photo of yourself holding your government ID beside your face.
                  Both your face and the ID must be visible and legible.
                </p>

                <ImageField
                  label="Selfie with government ID"
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
              </section>

              {/* ── Section 4: E-Signature ───────────────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-1">
                  <LuPenLine className="w-4 h-4 text-green-dark" />
                  <h3 className="text-xs font-bold text-brown-light uppercase tracking-widest">
                    Handwritten E-Signature
                  </h3>
                </div>

                {/* Instructions card */}
                <div className="bg-beige rounded-2xl px-4 py-4 mb-4 space-y-2">
                  <p className="text-sm font-semibold text-brown-dark">How to prepare your signature:</p>
                  <ol className="text-xs text-brown-mid space-y-1.5 list-decimal list-inside">
                    <li>Use a plain <strong>white sheet of bond paper</strong> (any size).</li>
                    <li>Write your <strong>full signature three (3) times</strong> using a black or blue pen — one below the other.</li>
                    <li>Make sure all three signatures are clearly written and not cut off.</li>
                    <li>Place the paper on a flat, well-lit surface.</li>
                    <li>Take a clear, straight-on photo — avoid shadows and blurriness.</li>
                  </ol>
                  <div className="mt-3 border border-beige-dark rounded-xl px-4 py-3 bg-white text-xs text-brown-light text-center italic">
                    ✦ Your handwritten signature will be used on all contracts you sign in CopTrax ✦
                  </div>
                </div>

                <ImageField
                  label="Photo of your handwritten signature (3× on white paper)"
                  required
                  preview={signaturePhoto?.dataUrl ?? null}
                  onFile={v => setSignaturePhoto(v)}
                  onCamera={() => setCamera({
                    facing: "environment",
                    title: "Photograph your Signature Sheet",
                    instructions: "Point the camera at the white paper with your 3 signatures. Make sure all three are fully visible, well-lit, and in focus.",
                    onCapture: v => setSignaturePhoto(v),
                  })}
                />
              </section>

              {/* ── Submit ───────────────────────────────────────── */}
              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-green-dark to-green-mid text-white font-bold py-3 rounded-xl
                           shadow-md hover:shadow-glow-green transition-all duration-300 disabled:opacity-60
                           disabled:cursor-not-allowed text-sm">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting…
                  </span>
                ) : "Submit Registration"}
              </button>
            </form>

            <p className="text-center text-sm text-brown-light">
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
