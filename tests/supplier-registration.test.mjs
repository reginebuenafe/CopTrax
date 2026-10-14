import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import {
  IMAGE_FORMAT_ERROR, REGISTRATION_IMAGE_ACCEPT, REGISTRATION_MAX_FILE_SIZE,
  emailError, passwordError, validateImageFile, validateImageBytes, validateImageDataUrl,
} from "../supabase/functions/_shared/supplier_registration_validation.mjs";

const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { build } = require("esbuild");
const root = fileURLToPath(new URL("../", import.meta.url));
const jpeg = Uint8Array.of(255, 216, 255, 224, 0, 16);
const png = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const heic = Uint8Array.of(0, 0, 0, 24, ...Buffer.from("ftypmif1"), 0, 0, 0, 0, ...Buffer.from("mif1heic"));
const tiff = Uint8Array.of(73, 73, 42, 0, 8, 0, 0, 0);
const file = (name, bytes = png, type = "image/png") => new File([bytes], name, { type });
const dataUrl = (bytes, mime = "image/png") => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
const formats = [["jpg", jpeg, "image/jpeg"], ["jpeg", jpeg, "image/jpeg"], ["png", png, "image/png"], ["heic", heic, "image/heic"], ["heif", heic, "image/heif"]];
const rejected = [["tiff", tiff, "image/tiff"], ["tif", tiff, "image/tiff"], ["gif", Buffer.from("GIF89a"), "image/gif"], ["webp", Buffer.from("RIFF0000WEBP"), "image/webp"], ["bmp", Buffer.from("BM0000"), "image/bmp"], ["pdf", Buffer.from("%PDF-1.7"), "application/pdf"]];

test("both upload validators allow listed formats, casing, and empty HEIC MIME", async () => {
  for (const [ext, bytes, mime] of formats) {
    assert.equal(await validateImageFile(file(`photo.${ext}`, bytes, mime)), "");
    assert.equal(await validateImageFile(file(`PHOTO.${ext.toUpperCase()}`, bytes, mime)), "");
    assert.ok(validateImageDataUrl(dataUrl(bytes, mime), `photo.${ext}`, mime).bytes.length);
  }
  for (const ext of ["heic", "heif"]) {
    assert.equal(await validateImageFile(file(`photo.${ext}`, heic, "")), "");
    assert.equal(validateImageDataUrl(dataUrl(heic, "application/octet-stream"), `photo.${ext}`, "").mimeType, "image/heic");
  }
  assert.equal(validateImageBytes("limit.png", "image/png", png, REGISTRATION_MAX_FILE_SIZE), "");
  assert.match(validateImageBytes("large.png", "image/png", png, REGISTRATION_MAX_FILE_SIZE + 1), /10 MB/);
});

test("reject unsupported extensions, forged MIME, renamed TIFF, and AVIF", async () => {
  for (const [ext, bytes, mime] of rejected) {
    assert.equal(await validateImageFile(file(`photo.${ext}`, bytes, mime)), IMAGE_FORMAT_ERROR);
    assert.throws(() => validateImageDataUrl(dataUrl(bytes, mime), `photo.${ext}`, mime), /Only JPEG/);
  }
  assert.equal(await validateImageFile(file("photo.tiff.png", tiff)), IMAGE_FORMAT_ERROR);
  assert.throws(() => validateImageDataUrl(dataUrl(tiff), "photo.tiff.png", "image/png"), /Only JPEG/);
  assert.equal(await validateImageFile(file("photo.png", png, "image/tiff")), IMAGE_FORMAT_ERROR);
  assert.equal(await validateImageFile(file("photo.jpg", png, "image/jpeg")), IMAGE_FORMAT_ERROR);
  assert.equal(await validateImageFile(file("png", png)), IMAGE_FORMAT_ERROR);
  const avif = Uint8Array.of(0, 0, 0, 24, ...Buffer.from("ftypmif1"), 0, 0, 0, 0, ...Buffer.from("mif1avif"));
  assert.equal(await validateImageFile(file("photo.heic", avif, "")), IMAGE_FORMAT_ERROR);
});

test("trimmed email and existing eight-character password policy with weak-password rejection", () => {
  for (const email of ["abc", "abc@", "abc@domain", "a b@x.com", "a@@x.com", "a@-x.com", "a@x.c", ".a@x.com", "a..b@x.com", "a<b@x.com"]) assert.ok(emailError(email), email);
  for (const email of ["name@domain.com", " name@domain.com ", "a+tag@sub.domain.com"]) assert.equal(emailError(email), "");
  for (const password of ["123123", "password", "12345678", "11111111", "12121212", "98765432", "78901234", "Password123"]) assert.ok(passwordError(password), password);
  assert.equal(passwordError("CopTrax!27"), "");
  // Retain the existing minimum; do not impose a new letter/digit requirement.
  assert.equal(passwordError("CoconutFarm"), "");
});

// Execute the real JSX event handlers with a small hook host. No real network,
// accounts, camera, or DOM mutations are needed to exercise wizard behavior.
async function compile(entry, mocks) {
  const result = await build({
    entryPoints: [`${root}${entry}`], bundle: true, write: false, format: "cjs", platform: "node",
    jsxFactory: "__jsx", jsxFragment: "__fragment",
    plugins: [{ name: "test-boundaries", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: "mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  return result.outputFiles[0].text;
}
function evaluate(code, globals) {
  const context = vm.createContext({ module: { exports: {} }, exports: {}, console, File, Uint8Array, DataView, TextEncoder, atob, Response, Request, URL, crypto: webcrypto, setTimeout, ...globals });
  vm.runInContext(code, context);
  return context;
}
const pageSource = await readFile(`${root}frontend/src/pages/auth/RegisterPage.jsx`, "utf8");
const iconNames = pageSource.match(/import \{([\s\S]*?)\} from "react-icons\/lu"/)[1].match(/Lu\w+/g);
const pageCode = await compile("frontend/src/pages/auth/RegisterPage.jsx", {
  react: "export const useState=(x)=>__hooks.useState(x); export const useRef=(x)=>__hooks.useRef(x); export const useEffect=()=>{};",
  "react-router-dom": "export const Link=()=>null; export const useNavigate=()=>__navigate;",
  "react-icons/lu": iconNames.map(name => `export const ${name}=()=>null;`).join("\n"),
  "../../lib/supabase": "export const supabase=__supabase;",
  "../../components/BrandLogo": "export default ()=>null;",
  "../../components/TermsConfirmModal": "export default ()=>null;",
  jsqr: "export default ()=>null;",
});
function pageHost() {
  const states = []; let cursor = 0; let calls = []; let navigations = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return states[index] ??= { current: initial }; },
  };
  class Reader {
    readAsDataURL(blob) { blob.arrayBuffer().then(bytes => this.onload({ target: { result: dataUrl(new Uint8Array(bytes), blob.type || "application/octet-stream") } })); }
  }
  const context = evaluate(pageCode, {
    __hooks: hooks, __fragment: "fragment", __jsx: (type, props, ...children) => ({ type, props: { ...props, children } }),
    __navigate: route => navigations.push(route), FileReader: Reader,
    window: { scrollTo() {} }, createImageBitmap: async () => { throw new Error("Use OCR fallback"); }, fetch,
    __supabase: {
      functions: { invoke: async (name, options) => {
        calls.push({ name, ...options });
        if (name === "extract-id-info") return { data: { first_name: "Juan", last_name: "Cruz" } };
        if (name === "supplier-signup") return { data: { data: { user: { id: "user-1" }, session: null } } };
        return { data: { success: true } };
      } },
      auth: { signOut: async () => {}, setSession: async () => ({}) },
    },
  });
  let tree;
  const render = () => { cursor = 0; tree = context.module.exports.default(); return tree; };
  const nodes = (node = tree) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(item => nodes(item)) : [node, ...nodes(node.props?.children)];
  const find = predicate => { const result = nodes().find(predicate); assert.ok(result, "Requested page control exists"); return result; };
  const text = node => typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : text(node?.props?.children || []);
  const button = name => find(node => node.type === "button" && text(node).includes(name));
  const input = placeholder => find(node => node.type === "input" && node.props.placeholder === placeholder);
  const image = () => find(node => node.type?.name === "ImageField");
  const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } };
  const change = (placeholder, value) => { input(placeholder).props.onChange({ target: { value } }); render(); };
  const next = async () => { await button("Next").props.onClick(); await settle(); };
  const enter = async () => {
    find(node => node.type === "form").props.onKeyDown({ key: "Enter", target: { tagName: "INPUT", type: "text" }, preventDefault() {} });
    await settle();
  };
  const selectFile = async upload => {
    let img = image();
    if (img.props.preview) {
      await img.props.onFile(null); await settle(); img = image();
    }
    if (img.props.onSelect) {
      // Exercise ImageField's actual input event, including reset of input.value.
      const saved = cursor;
      const local = img.type(img.props);
      const inputNode = nodes(local).find(node => node.type === "input");
      cursor = saved;
      const target = { files: [upload], value: upload.name };
      inputNode.props.onChange({ target });
      assert.equal(target.value, "");
    } else await img.props.onFile({ file: upload, dataUrl: dataUrl(png) });
    await settle();
  };
  const start = async () => {
    find(node => node.type === "select").props.onChange({ target: { value: "Philippine Passport" } }); render();
    await selectFile(file("id.png")); await next();
  };
  const personal = () => {
    change("Juan", "Juan"); change("dela Cruz", "Cruz"); change("you@example.com", "name@domain.com");
    change("0917 123 4567", "09171234567"); change("Min. 8 characters", "CopTrax!27"); change("Re-enter password", "CopTrax!27");
  };
  render();
  return { render, find, image, input, button, change, next, enter, selectFile, start, personal, settle, calls, navigations };
}

test("both ID/signature controls validate selection and clear rejected previews", async () => {
  const page = pageHost();
  for (const field of ["govIdPhoto", "signaturePhoto"]) {
    for (const [ext, bytes, mime] of formats) {
      assert.equal(page.image().props.accept, REGISTRATION_IMAGE_ACCEPT);
      await page.selectFile(file(`photo.${ext}`, bytes, mime));
      assert.ok(page.image().props.preview);
      assert.ok(!page.image().props.error);
    }
    await page.selectFile(file("photo.heic", heic, "")); assert.ok(page.image().props.preview);
    for (const [ext, bytes, mime] of [...rejected, ["tiff.png", tiff, "image/png"]]) {
      await page.selectFile(file(`photo.${ext}`, bytes, mime));
      assert.equal(page.image().props.preview, null);
      assert.equal(page.image().props.error, IMAGE_FORMAT_ERROR);
      assert.ok(page.button("Next").props.disabled);
      await page.enter(); assert.equal(page.image().props.error, IMAGE_FORMAT_ERROR);
      assert.equal(page.calls.filter(call => call.name === "supplier-signup").length, 0);
    }
    if (field === "govIdPhoto") {
      await page.start(); page.personal(); await page.next();
      assert.equal(page.image().props.accept, undefined, "Selfie keeps its original upload policy");
      await page.selectFile(file("selfie.png")); await page.next();
    }
  }
});

test("email/password blur, Next, Enter, confirmation, and complete wizard", async () => {
  const page = pageHost(); await page.start(); page.personal();
  for (const email of ["abc", "abc@", "abc@domain", "a b@x.com"]) {
    page.change("you@example.com", email);
    page.input("you@example.com").props.onBlur(); page.render();
    assert.ok(page.input("you@example.com").props["aria-invalid"]);
    assert.ok(page.button("Next").props.disabled);
    await page.next(); await page.enter();
    assert.ok(page.input("you@example.com").props["aria-invalid"]);
    assert.equal(page.calls.filter(call => call.name === "supplier-signup").length, 0);
  }
  page.change("you@example.com", " name@domain.com "); page.input("you@example.com").props.onBlur(); page.render();
  assert.equal(page.input("you@example.com").props.value, "name@domain.com");
  for (const password of ["123123", "password", "12345678"]) {
    page.change("Min. 8 characters", password); page.change("Re-enter password", password);
    page.input("Min. 8 characters").props.onBlur(); page.render();
    assert.ok(page.button("Next").props.disabled);
    await page.next(); await page.enter();
    assert.ok(page.input("Min. 8 characters").props["aria-invalid"]);
  }
  page.change("Min. 8 characters", "CopTrax!27"); page.change("Re-enter password", "wrong");
  await page.enter(); assert.ok(page.input("Re-enter password").props["aria-invalid"]);
  page.change("Re-enter password", "CopTrax!27"); assert.ok(!page.button("Next").props.disabled);
  await page.enter(); assert.equal(page.image().props.label, "Selfie holding your government ID");
  await page.selectFile(file("selfie.png")); await page.next(); await page.selectFile(file("signature.png")); await page.next();
  page.find(node => node.type === "select").props.onChange({ target: { value: "BDO Unibank" } }); page.render();
  page.change("Exactly as it appears on the account", "Juan Cruz"); page.change("e.g. 001234567890", "001234567890");
  const submit = page.find(node => node.type === "form").props.onSubmit;
  await Promise.all([submit({ preventDefault() {} }), submit({ preventDefault() {} })]); await page.settle();
  assert.equal(page.calls.filter(call => call.name === "supplier-signup").length, 1);
  const upload = page.calls.find(call => call.name === "upload-registration-files").body;
  assert.equal(upload.gov_id_name, "id.png"); assert.equal(upload.esign_name, "signature.png");
  assert.deepEqual(page.navigations, ["/pending-approval"]);
});

test("camera additions share upload validation; later image checks cannot overwrite a new selection", async () => {
  const page = pageHost();
  page.image().props.onCamera(); page.render();
  const camera = page.find(node => node.type?.name === "CameraModal");
  await camera.props.onCapture({ file: file("capture.jpg", jpeg, "image/jpeg") }); await page.settle();
  assert.ok(page.image().props.preview);
  let release;
  const slow = file("old.tiff", tiff, "image/tiff");
  slow.slice = () => ({ arrayBuffer: () => new Promise(resolve => { release = resolve; }) });
  const oldSelection = page.image().props.onFile({ file: slow }); page.render();
  assert.ok(page.button("Next").props.disabled);
  await page.selectFile(file("new.png"));
  release(tiff.buffer); await oldSelection; await page.settle();
  assert.ok(page.image().props.preview); assert.ok(!page.image().props.error);
});

test("overlapping Next requests cannot skip personal-information validation", async () => {
  const page = pageHost();
  page.find(node => node.type === "select").props.onChange({ target: { value: "Philippine Passport" } }); page.render();
  await page.selectFile(file("id.png"));
  const next = page.button("Next").props.onClick;
  await Promise.all([next(), next()]); await page.settle();
  assert.equal(page.input("you@example.com").props.value, "");
  assert.ok(page.button("Next").props.disabled);
});

test("final submission revalidates earlier uploads before calling signup", async () => {
  const page = pageHost(); await page.start(); page.personal(); await page.next();
  await page.selectFile(file("selfie.png")); await page.next();
  let currentName = "signature.png";
  const signature = file(currentName);
  Object.defineProperty(signature, "name", { get: () => currentName });
  await page.selectFile(signature); await page.next();
  currentName = "signature.tiff";
  await page.find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); await page.settle();
  assert.equal(page.image().props.error, IMAGE_FORMAT_ERROR);
  assert.equal(page.image().props.preview, null);
  assert.equal(page.calls.filter(call => call.name === "supplier-signup").length, 0);
  // An error in a later step must allow Back/Next through the earlier steps.
  page.button("Back").props.onClick(); page.render();
  assert.ok(!page.button("Next").props.disabled);
});

const signupCode = await compile("supabase/functions/supplier-signup/index.ts", {
  "https://esm.sh/@supabase/supabase-js@2": "export const createClient=()=>__client;",
  // Auth transport boundary is mocked; proof creation/verification uses real WebCrypto.
  "https://esm.sh/standardwebhooks@1.0.0": "export class Webhook { verify(payload, headers) { if (headers['webhook-signature'] !== 'valid-test-signature') throw Error('invalid'); return JSON.parse(payload); } }",
});
test("signup API rejects invalid credentials before Auth, preserves duplicate errors, and hook prevents bypass", async () => {
  const calls = []; let handler; let result = { data: { user: { id: "user-1" }, session: null }, error: null };
  evaluate(signupCode, {
    Deno: { env: { get: key => key === "SUPPLIER_SIGNUP_HOOK_SECRET" ? "v1,whsec_test" : "test-secret" }, serve: fn => { handler = fn; } },
    __client: { auth: { signUp: async args => { calls.push(args); return result; } } },
  });
  const signup = (email, password = "CopTrax!27", confirm_password = password) => handler(new Request("https://test/signup", { method: "POST", body: JSON.stringify({ email, password, confirm_password }) }));
  for (const email of ["abc", "abc@", "abc@domain", "a b@x.com"]) assert.equal((await signup(email)).status, 400);
  for (const password of ["123123", "password", "12345678"]) assert.equal((await signup("name@domain.com", password)).status, 400);
  assert.equal((await signup("name@domain.com", "CopTrax!27", "wrong")).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await signup(" name@domain.com ")).status, 200);
  assert.equal(calls[0].email, "name@domain.com"); assert.equal(calls[0].password, "CopTrax!27");
  const hook = (user, signature = "valid-test-signature") => handler(new Request("https://test/signup", { method: "POST", headers: { "webhook-id": "test", "webhook-signature": signature }, body: JSON.stringify({ user }) }));
  const user = { email: "name@domain.com", user_metadata: calls[0].options.data };
  assert.deepEqual(await (await hook(user)).json(), {});
  assert.ok((await (await hook({ ...user, user_metadata: { role: "Supplier" } })).json()).error);
  assert.ok((await (await hook({ ...user, email: "another@domain.com" })).json()).error);
  const proof = user.user_metadata.supplier_signup_validation;
  assert.ok((await (await hook({ ...user, user_metadata: { ...user.user_metadata, supplier_signup_validation: { ...proof, expires: 1 } } })).json()).error);
  assert.equal((await hook(user, "forged")).status, 401);
  assert.deepEqual(await (await hook({ email: "staff@domain.com", user_metadata: { role: "Weigher" } })).json(), {});
  result = { data: null, error: { message: "User already registered", status: 422 } };
  const duplicate = await signup("name@domain.com"); assert.equal(duplicate.status, 422);
  assert.equal((await duplicate.json()).error.message, "User already registered");
});

const uploadCode = await compile("supabase/functions/upload-registration-files/index.ts", {
  "https://esm.sh/@supabase/supabase-js@2": "export const createClient=()=>__makeClient();",
});
test("upload API checks both fields before side effects and keeps valid registration records", async () => {
  let handler; let clients = 0; const uploaded = []; const tables = [];
  evaluate(uploadCode, {
    Deno: { env: { get: () => "test" }, serve: fn => { handler = fn; } },
    __makeClient: () => {
      clients++;
      return {
        from(table) {
          tables.push(table);
          const result = { data: table === "file_uploads" ? { file_id: "file-1" } : { user_id: "user-1" }, error: null };
          const query = { then: resolve => Promise.resolve(result).then(resolve) };
          for (const method of ["select", "eq", "single", "update", "insert"]) query[method] = () => query;
          return query;
        },
        storage: { from: () => ({ upload: async (path, bytes, options) => { uploaded.push({ path, bytes, options }); return { data: { path }, error: null }; } }) },
      };
    },
  });
  const base = { user_id: "user-1", gov_id_type: "Passport", gov_id_data: dataUrl(png), gov_id_name: "id.png", gov_id_mime: "image/png", esign_data: dataUrl(png), esign_name: "signature.png", esign_mime: "image/png", face_id_data: dataUrl(png), bank_name: "BDO", account_name: "Juan", account_number: "123456789" };
  const send = body => handler(new Request("https://test/upload", { method: "POST", body: JSON.stringify(body) }));
  for (const field of ["gov_id", "esign"]) {
    for (const [ext, bytes, mime] of [...rejected, ["tiff.png", tiff, "image/png"]]) {
      assert.equal((await send({ ...base, [`${field}_data`]: dataUrl(bytes, mime), [`${field}_name`]: `photo.${ext}`, [`${field}_mime`]: mime })).status, 400);
    }
  }
  assert.equal(clients, 0); assert.equal(uploaded.length, 0);
  for (const [ext, bytes, mime] of formats) {
    assert.equal((await send({ ...base, gov_id_data: dataUrl(bytes, mime), gov_id_name: `id.${ext}`, gov_id_mime: mime, esign_data: dataUrl(bytes, mime), esign_name: `signature.${ext}`, esign_mime: mime })).status, 200);
  }
  assert.equal((await send({ ...base, gov_id_data: dataUrl(heic, "application/octet-stream"), gov_id_name: "id.heic", gov_id_mime: "", esign_data: dataUrl(heic, "application/octet-stream"), esign_name: "signature.heic", esign_mime: "" })).status, 200);
  assert.ok(uploaded.some(upload => upload.options.contentType === "image/heic"));
  assert.ok(tables.includes("user_verify")); assert.ok(tables.includes("bank_accounts"));
});
