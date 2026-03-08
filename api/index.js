// Backend for Can'tseeme24 - Vercel Serverless (Node.js)
// Original: Flask (Python) → Vercel API Route

const axios = require("axios");

// ─── Config ───────────────────────────────────────────────────────────────────

const settings = {
  TitleId: "48B3E",
  SecretKey: "C75EOH35UT3MAUMYGZRTPFTMDJQMRCMNCUR48PGY1EWEO4FWB4",
  ApiKey: "OC|9657409904382923|a0171ee95a2f9b276cc941e7b11f6015",
  DiscordWebhook: "https://discord.com/api/webhooks/1473091883449323562/PYmbIc3I06v5FpFacmDCmgWi774501GbiKH6yk5EynvTi4hZqGkjBFQXPhWohIw4leaI",
  getAuthHeaders() {
    return { "content-type": "application/json", "X-SecretKey": this.SecretKey };
  },
};

const badNames = [
  "JMAN", // add more here if needed
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "Unknown";
}

// Gets the org-scoped oculus id for display in discord webhooks
async function getOrgScopedId(oculusId) {
  if (!oculusId) return null;
  try {
    const res = await axios.get(
      `https://graph.oculus.com/${oculusId}?access_token=${settings.ApiKey}&fields=org_scoped_id`,
      { headers: { "Content-Type": "application/json" }, timeout: 5000 }
    );
    return res.data?.org_scoped_id ?? null;
  } catch {
    return null;
  }
}

// Validates that the oculus ID is real AND the nonce is valid
// Supports multiple AppLab API keys — add more to the keys array if needed
async function validateOculus(ocId, nonce) {
  const keys = [
    settings.ApiKey,
    // "OC|...|...", // add more AppLab keys here
  ];

  for (const token of keys) {
    try {
      // Step 1: check if oculus ID exists
      const idCheck = await axios.get(
        `https://graph.oculus.com/${ocId}?access_token=${token}`,
        { headers: { "Content-Type": "application/json" } }
      );
      const idData = idCheck.data;

      if (idData?.error) {
        const msg = idData.error?.message || "";
        if (msg.includes("Cannot parse access token")) continue;
        // Any other error means this key didn't work, try next
        continue;
      }

      if (!idData?.id) continue;

      // Step 2: validate the nonce
      const nonceCheck = await axios.post(
        "https://graph.oculus.com/user_nonce_validate",
        { nonce, access_token: token },
        { headers: { "Content-Type": "application/json" } }
      );
      const nonceData = nonceCheck.data;

      if (nonceData?.is_valid === "true" || nonceData?.is_valid === true) return true;

      if (nonceData?.error) {
        const msg = nonceData.error?.message || "";
        if (msg.includes("Cannot parse access token")) continue;
      }
    } catch (e) {
      console.error("validateOculus error:", e.message);
    }
  }

  console.log("Oculus validation failed for:", ocId);
  return false;
}

// Sends a formatted ANSI embed to the discord webhook
async function sendAuthWebhook({
  success,
  playerIp,
  customId = null,
  playfabId = null,
  oculusId = null,
  errorMessage = null,
  realIp = null,
  platform = null,
  appVersion = null,
  appId = null,
}) {
  try {
    const ip = realIp || playerIp;
    const timestamp = new Date().toISOString();

    const reset  = "\u001b[0m";
    const cyan   = "\u001b[36m";
    const white  = "\u001b[37m";
    const red    = "\u001b[31m";
    const yellow = "\u001b[33m";

    const playerField = {
      name: "Player Information",
      value: success
        ? `\`\`\`ansi\n${cyan}[Custom ID]${reset}:    ${white}${customId || "N/A"}${reset}\n${cyan}[PlayFab ID]${reset}:   ${white}${playfabId || "N/A"}${reset}\n${cyan}[OrgScoped ID]${reset}: ${white}${oculusId || "N/A"}${reset}\`\`\``
        : `\`\`\`ansi\n${cyan}[Custom ID]${reset}:    ${white}${customId || "N/A"}${reset}\n${cyan}[OrgScoped ID]${reset}: ${white}${oculusId || "N/A"}${reset}\`\`\``,
      inline: false,
    };

    const connectionField = {
      name: "Connection Details",
      value: `\`\`\`ansi\n${cyan}[IP Address]${reset}:  ${white}${ip}${reset}\n${cyan}[Platform]${reset}:    ${white}${platform || "N/A"}${reset}\n${cyan}[App Version]${reset}: ${white}${appVersion || "N/A"}${reset}\n${cyan}[App ID]${reset}:      ${white}${appId || "N/A"}${reset}\`\`\``,
      inline: false,
    };

    const timestampField = {
      name: "Timestamp",
      value: `\`\`\`ansi\n${cyan}[Time]${reset}: ${white}${timestamp}${reset}\`\`\``,
      inline: false,
    };

    const fields = success
      ? [playerField, connectionField, timestampField]
      : [
          playerField,
          connectionField,
          {
            name: "Error",
            value: `\`\`\`ansi\n${red}[Error]${reset}: ${yellow}${errorMessage || "Unknown Error"}${reset}\`\`\``,
            inline: false,
          },
          timestampField,
        ];

    await axios.post(settings.DiscordWebhook, {
      content: null,
      embeds: [{
        color: success ? 65280 : 16711680,
        author: { name: "Sigmer Auth" },
        title: success ? "NORMAL FELLA LOGGED IN!" : "INVALID FELLA TRIED TO AUTH!",
        fields,
        timestamp,
      }],
    }, { timeout: 5000 });
  } catch (e) {
    console.error("sendAuthWebhook failed:", e.message);
  }
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

async function handleRoot(req, res) {
  if (req.method === "POST") return res.status(200).send("The Backend Works");

  // GET — serve the dashboard HTML
  const routes = [
    { path: "/",                              methods: ["GET", "POST"],  endpoint: "main" },
    { path: "/api/PlayFabAuthentication",     methods: ["POST"],         endpoint: "playfab_authentication" },
    { path: "/api/CachePlayFabId",            methods: ["POST"],         endpoint: "cache_playfab_id" },
    { path: "/api/TitleData",                 methods: ["GET", "POST"],  endpoint: "titledata" },
    { path: "/api/TitleDataQuest",            methods: ["GET", "POST"],  endpoint: "titledata_quest" },
    { path: "/api/CheckForBadName",           methods: ["GET", "POST"],  endpoint: "check_for_bad_name" },
    { path: "/api/GetAcceptedAgreements",     methods: ["GET", "POST"],  endpoint: "get_accepted_agreements" },
    { path: "/api/SubmitAcceptedAgreements",  methods: ["GET", "POST"],  endpoint: "submit_accepted_agreements" },
    { path: "/api/UploadGorillanalytics",     methods: ["POST"],         endpoint: "upload_gorillanalytics" },
    { path: "/api/ConsumeOculusIAP",          methods: ["POST"],         endpoint: "consume_oculus_iap" },
    { path: "/api/ConsumeCodeItem",           methods: ["POST"],         endpoint: "consume_code_item" },
    { path: "/api/v2/GetName",                methods: ["GET", "POST"],  endpoint: "get_name" },
    { path: "/api/photon",                    methods: ["POST"],         endpoint: "photon_auth" },
    { path: "/api/v3/photon",                 methods: ["GET", "POST"],  endpoint: "v3_photon_auth" },
    { path: "/api/photon/authenticate",       methods: ["POST"],         endpoint: "photon_authenticate" },
    { path: "/api/photon/authenticate/pcvr",  methods: ["POST"],         endpoint: "photon_authenticate_pcvr" },
  ];

  function sectionFor(path) {
    const p = path.toLowerCase();
    if (path === "/") return "Core";
    if (p.includes("photon")) return "Photon";
    if (p.includes("playfabauthentication")) return "Authentication";
    if (p.includes("cacheplayfabid")) return "PlayFab";
    if (p.includes("titledata") || p.includes("agreements") || p.includes("badname") || p.includes("getname")) return "Title & Profile";
    if (p.includes("consume") || p.includes("iap") || p.includes("codeitem")) return "Commerce";
    if (p.includes("gorillanalytics")) return "Telemetry";
    return "Misc";
  }

  const sectionOrder = ["Core", "Authentication", "Photon", "PlayFab", "Title & Profile", "Commerce", "Telemetry", "Misc"];
  const grouped = Object.fromEntries(sectionOrder.map((n) => [n, []]));
  for (const r of [...routes].sort((a, b) => a.path.localeCompare(b.path))) {
    grouped[sectionFor(r.path)].push({ ...r, isGet: r.methods.includes("GET") });
  }
  const sections = sectionOrder.filter((n) => grouped[n].length).map((n) => ({ name: n, routes: grouped[n], count: grouped[n].length }));

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>cantseeme24 Backend</title>
  <style>
    :root{--bg:#0b0f14;--panel:#111922;--panel-2:#0e151d;--text:#d9e2ec;--muted:#8aa1b5;--line:#1f2a37;--accent:#3ddc97;--accent-2:#2f81f7}
    *{box-sizing:border-box}
    body{margin:0;color:var(--text);font-family:Consolas,"Cascadia Code","Fira Code",monospace;background:radial-gradient(1200px 500px at 10% -10%,#15314d 0%,transparent 50%),radial-gradient(900px 450px at 100% 0%,#132b23 0%,transparent 45%),var(--bg)}
    .wrap{max-width:980px;margin:40px auto;padding:0 16px}
    .hero{border:1px solid var(--line);background:linear-gradient(160deg,var(--panel),var(--panel-2));border-radius:14px;padding:18px;margin-bottom:14px;box-shadow:0 8px 28px rgba(0,0,0,.35)}
    .title{margin:0 0 6px;font-size:22px;color:var(--accent)}
    .muted{color:var(--muted);margin:0}
    .section-nav{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 14px}
    .chip{border:1px solid var(--line);border-radius:999px;background:#0d141c;color:#bcd0e1;padding:6px 10px;font-size:12px;text-decoration:none;display:inline-block}
    .chip:hover{border-color:#2b3d52;color:#d9e2ec}
    .chip-count{color:#87a0b8;margin-left:6px}
    .section{margin-bottom:14px}
    .section-title{margin:0 0 8px;font-size:14px;color:#b7cbe0;letter-spacing:.04em;text-transform:uppercase}
    .card{border:1px solid var(--line);background:#0c131a;border-radius:14px;overflow:hidden}
    table{width:100%;border-collapse:collapse}
    th,td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:middle;text-align:left;font-size:13px}
    th{color:var(--muted);font-weight:600;letter-spacing:.04em}
    tr:last-child td{border-bottom:none}
    .path{color:var(--accent-2);text-decoration:none;font-weight:600}
    .path:hover{text-decoration:underline}
    .badge{display:inline-block;min-width:48px;text-align:center;padding:4px 8px;margin-right:6px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid transparent;color:#e6edf3}
    .get{background:rgba(35,134,54,.25);border-color:rgba(35,134,54,.55)}
    .post{background:rgba(31,111,235,.25);border-color:rgba(31,111,235,.55)}
    .method-raw{color:var(--muted)}
    .footer{margin-top:12px;font-size:12px;color:var(--muted)}
    code{color:#b6c6d9;background:#0b1118;border:1px solid var(--line);border-radius:6px;padding:1px 6px}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <h1 class="title">Gorilla Tag Backend API Dashboard</h1>
      <p class="muted">Route explorer for the Gorilla Tag "Can't see me" 2024 update</p>
    </section>
    <nav class="section-nav">
      ${sections.map((s) => `<a class="chip" href="#${s.name.toLowerCase().replace(/ /g, "-").replace(/&/g, "and")}">${s.name} <span class="chip-count">(${s.count})</span></a>`).join("\n      ")}
    </nav>
    ${sections.map((s) => `
    <section class="section" id="${s.name.toLowerCase().replace(/ /g, "-").replace(/&/g, "and")}">
      <h2 class="section-title">${s.name} <span class="chip-count">(${s.count})</span></h2>
      <div class="card">
        <table>
          <thead><tr><th>Route</th><th>Methods</th><th>Endpoint</th></tr></thead>
          <tbody>
            ${s.routes.map((r) => `<tr>
              <td>${r.isGet ? `<a class="path" href="${r.path}" target="_blank" rel="noopener noreferrer">${r.path}</a>` : `<span class="method-raw">${r.path}</span>`}</td>
              <td>${r.methods.map((m) => `<span class="badge ${m.toLowerCase()}">${m}</span>`).join("")}</td>
              <td><code>${r.endpoint}</code></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`).join("")}
    <p class="footer">GET routes are clickable. POST-only routes require a client like Insomnia.</p>
  </main>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  return res.status(200).send(html);
}

async function handlePlayFabAuthentication(req, res) {
  const rjson = req.body;
  const playerIp = getClientIp(req);
  const realIp = req.headers["x-real-ip"] || null;

  if (!rjson || typeof rjson !== "object") {
    await sendAuthWebhook({ success: false, playerIp, realIp, errorMessage: "BadRequest-InvalidJSON" });
    return res.status(400).json({ Message: "Invalid JSON body", Error: "BadRequest-InvalidJSON" });
  }

  // Grab org-scoped id early so we can include it in all webhook calls
  const orgScopedId = await getOrgScopedId(rjson.OculusId);

  // Shared webhook params so we don't repeat ourselves
  const baseWebhookParams = {
    playerIp, realIp,
    customId:   rjson.CustomId,
    oculusId:   orgScopedId,
    platform:   rjson.Platform,
    appVersion: rjson.AppVersion,
    appId:      rjson.AppId,
  };

  // Check required fields
  const requiredFields = ["CustomId", "Nonce", "AppId", "Platform", "OculusId"];
  const missingFields = requiredFields.filter((f) => !rjson[f]);
  if (missingFields.length) {
    await sendAuthWebhook({ ...baseWebhookParams, success: false, errorMessage: `BadRequest-No${missingFields[0]}` });
    return res.status(400).json({ Message: `Missing parameter(s): ${missingFields.join(", ")}`, Error: `BadRequest-No${missingFields[0]}` });
  }

  // Check App ID matches
  if (rjson.AppId !== settings.TitleId) {
    await sendAuthWebhook({ ...baseWebhookParams, success: false, errorMessage: "BadRequest-AppIdMismatch" });
    return res.status(400).json({ Message: "Request sent for the wrong App ID", Error: "BadRequest-AppIdMismatch" });
  }

  // Check CustomId prefix (OC = Quest, PI = PCVR)
  if (!rjson.CustomId.startsWith("OC") && !rjson.CustomId.startsWith("PI")) {
    await sendAuthWebhook({ ...baseWebhookParams, success: false, errorMessage: "BadRequest-IncorrectPrefix" });
    return res.status(400).json({ Message: "Bad request", Error: "BadRequest-IncorrectPrefix" });
  }

  // Validate Oculus ID + nonce before touching PlayFab
  const isValidOculus = await validateOculus(rjson.OculusId, rjson.Nonce);
  if (!isValidOculus) {
    await sendAuthWebhook({ ...baseWebhookParams, success: false, errorMessage: "BadRequest-InvalidOculus" });
    return res.status(403).json({ Message: "Invalid Oculus ID or Nonce", Error: "BadRequest-InvalidOculus" });
  }

  // Login with PlayFab
  let loginRequest;
  try {
    loginRequest = await axios.post(
      `https://${settings.TitleId}.playfabapi.com/Server/LoginWithServerCustomId`,
      { ServerCustomId: rjson.CustomId, CreateAccount: true },
      { headers: settings.getAuthHeaders() }
    );
  } catch (err) {
    const errData = err.response?.data || {};
    const status  = err.response?.status || 500;

    // PlayFab ban (errorCode 1002)
    if (status === 403 && errData.errorCode === 1002) {
      const banDetails       = errData.errorDetails || {};
      const banExpirationKey  = Object.keys(banDetails)[0] || null;
      const banExpiration     = (banDetails[banExpirationKey] || [])[0] || "No expiration date provided.";
      await sendAuthWebhook({ ...baseWebhookParams, success: false, errorMessage: errData.errorMessage || "Banned" });
      return res.status(403).json({ BanMessage: banExpirationKey, BanExpirationTime: banExpiration });
    }

    const errorMessage = errData.errorMessage || "An error occurred.";
    await sendAuthWebhook({ ...baseWebhookParams, success: false, errorMessage });
    return res.status(status).json({ Error: "PlayFab Error", Message: errorMessage });
  }

  const data         = loginRequest.data?.data;
  const sessionTicket = data?.SessionTicket;
  const entityToken   = data?.EntityToken?.EntityToken;
  const playfabId     = data?.PlayFabId;
  const entityType    = data?.EntityToken?.Entity?.Type;
  const entityId      = data?.EntityToken?.Entity?.Id;

  // Link the custom ID using the client endpoint + session ticket (NOT LinkServerCustomId)
  await axios.post(
    `https://${settings.TitleId}.playfabapi.com/Client/LinkCustomID`,
    { CustomId: rjson.CustomId, ForceLink: true },
    { headers: { "content-type": "application/json", "x-authorization": sessionTicket } }
  ).catch(() => {});

  await sendAuthWebhook({ ...baseWebhookParams, success: true, playfabId });
  return res.status(200).json({ PlayFabId: playfabId, SessionTicket: sessionTicket, EntityToken: entityToken, EntityId: entityId, EntityType: entityType });
}

async function handleCachePlayFabId(req, res) {
  return res.status(200).json({ Message: "Success" });
}

async function handleTitleData(req, res) {
  return res.status(200).json({
    AutoMuteCheckedHours: { hours: 169 },
    AutoName_Adverbs: ["Cool", "Fine", "Bald", "Bold", "Half", "Only", "Calm", "Fab", "Ice", "Mad", "Rad", "Big", "New", "Old", "Shy"],
    AutoName_Nouns:   ["Gorilla", "Chicken", "Darling", "Sloth", "King", "Queen", "Royal", "Major", "Actor", "Agent", "Elder", "Honey", "Nurse", "Doctor", "Rebel", "Shape", "Ally", "Driver", "Deputy"],
    CreditsData: [
      { Title: "<color=blue>UPDATE MAKERS/PLAYFAB MANAGERS</color>",  Entries: ["L1RSON (UPDATE MAKER/PLAYFAB MANAGER)", "KITTY (OWNER/PLAYFAB MANAGER)", "Z3N (OWNER)"] },
      { Title: "<color=yellow>CREDITS TO</color>",                    Entries: ["TABLE", "L1RSON", "S4GE", "IRES", "QUIZX"] },
      { Title: "<color=red>GAY FELLAS</color>",                       Entries: ["DESK", "TABLE", "IRES", "RASP", "KEN"] },
    ],
    BundleBoardSign:          "<color=#ff4141>DISCORD.GG/Vnkh3Hr9RE</color>",
    BundleKioskButton:        "<color=#ff4141>DISCORD.GG/Vnkh3Hr9RE</color>",
    BundleKioskSign:          "<color=#ff4141>DISCORD.GG/Vnkh3Hr9RE</color>",
    BundleLargeSign:          "<color=#ff4141>DISCORD.GG/Vnkh3Hr9RE</color>",
    EmptyFlashbackText:       "FLOOR TWO NOW OPEN\n FOR BUSINESS\n\nSTILL SEARCHING FOR\nBOX LABELED 2021",
    EnableCustomAuthentication: true,
    GorillanalyticsChance:    4320,
    LatestPrivacyPolicyVersion: "2024.09.20",
    LatestTOSVersion:         "2024.09.20",
    MOTD: "<color=#bb29ff>[ WELCOME TO ORIGINAL TAG REVIVED ]</color>\n <color=#07dde8>CHRISTMUH 23!</color>\n<color=#ffff00>CREATOR/FOUNDER : Z3N</color>\n<color=#969696>CREDITS TO: IRES, L1RSON, S4GE, SCREAMINGCAT, Z3N, RASP, TABLE</color>\n<color=#ff8800>DISCORD.GG/Vnkh3Hr9RE</color>\n<color=#000000>CHANGE YOUR NAME FROM oldgorilla AS IT'S BANNABLE!</color>",
    SeasonalStoreBoardSign:   "<color=yellow>RATE THE GAME 5 STARS!</color>\n\n<color=aqua>.GG/Vnkh3Hr9RE",
    "TOS_2024.09.20":         "DISCORD.GG/Vnkh3Hr9RE",
    TOBAlreadyOwnCompTxt:     "DISCORD.GG/Vnkh3Hr9RE",
    TOBAlreadyOwnPurchaseBundle: "RETRO",
    TOBDefCompTxt:            "DISCORD.GG/Vnkh3Hr9RE",
    TOBDefPurchaseBtnDefTxt:  "RETRO",
    UseLegacyIAP:             false,
  });
}

async function handleTitleDataQuest(req, res) {
  try {
    const response = await axios.post(
      `https://${settings.TitleId}.playfabapi.com/Server/GetTitleData`,
      {},
      { headers: settings.getAuthHeaders() }
    );
    const data = response.data?.data?.Data || {};
    return res.status(200).json(JSON.parse(JSON.stringify(data).replace(/\\\\/g, "\\")));
  } catch (err) {
    return res.status(err.response?.status || 500).json({ error: "Failed to fetch title data" });
  }
}

async function handleCheckForBadName(req, res) {
  const body = req.body || {};
  const args = body?.FunctionArgument || body;
  const name = args?.name;
  if (badNames.includes(name)) return res.status(200).json({ result: 1 });
  return res.status(200).json({ error: "Method not allowed" }); // matches real GT backend response for non-bad names
}

async function handleGetAcceptedAgreements(req, res) {
  const result = req.body?.FunctionResult;
  if (result == null) {
    return res.status(415).json({ error: "Unsupported Media Type", message: "Missing FunctionResult in request body." });
  }
  return res.status(200).json(result);
}

async function handleSubmitAcceptedAgreements(req, res) {
  const result = req.body?.FunctionResult;
  if (result == null) {
    return res.status(415).json({ error: "Unsupported Media Type", message: "Missing FunctionResult in request body." });
  }
  return res.status(200).json(result);
}

async function handleUploadGorillanalytics(req, res) {
  const data = req.body;
  if (!data) return res.status(400).json({ error: "Invalid data" });

  const fr = data.FunctionResult || {};
  const embed = {
    title: "New Gorillanalytics Upload",
    color: 5814783,
    fields: [
      { name: "Version",        value: String(fr.version        ?? "N/A"), inline: true },
      { name: "Upload Chance",  value: String(fr.upload_chance  ?? "N/A"), inline: true },
      { name: "Map",            value: String(fr.map            ?? "N/A"), inline: true },
      { name: "Mode",           value: String(fr.mode           ?? "N/A"), inline: true },
      { name: "Queue",          value: String(fr.queue          ?? "N/A"), inline: true },
      { name: "Player Count",   value: String(fr.player_count   ?? "N/A"), inline: true },
      { name: "Position",       value: `(${fr.pos_x ?? "N/A"}, ${fr.pos_y ?? "N/A"}, ${fr.pos_z ?? "N/A"})`, inline: false },
      { name: "Velocity",       value: `(${fr.vel_x ?? "N/A"}, ${fr.vel_y ?? "N/A"}, ${fr.vel_z ?? "N/A"})`, inline: false },
      { name: "Cosmetics Owned",value: String(fr.cosmetics_owned ?? "None"), inline: false },
      { name: "Cosmetics Worn", value: String(fr.cosmetics_worn  ?? "None"), inline: false },
    ],
  };

  try {
    await axios.post(settings.DiscordWebhook, { embeds: [embed] }, { headers: { "Content-Type": "application/json" } });
    return res.status(200).json({ status: "Success" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send embed", message: err.message });
  }
}

async function handleConsumeOculusIAP(req, res) {
  const { userID, nonce, sku } = req.body || {};
  try {
    const response = await axios.post(
      `https://graph.oculus.com/consume_entitlement?nonce=${nonce}&user_id=${userID}&sku=${sku}&access_token=${settings.ApiKey}`,
      {},
      { headers: { "content-type": "application/json" } }
    );
    if (response.data?.success) return res.status(200).json({ result: true });
    return res.status(200).json({ error: true });
  } catch {
    return res.status(500).json({ error: true });
  }
}

async function handleConsumeCodeItem(req, res) {
  const { itemGUID: code, playFabID: playfabId, playFabSessionTicket: sessionTicket } = req.body || {};

  if (!code || !playfabId || !sessionTicket) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // Verify the session ticket actually belongs to this playfab ID
  // This prevents someone from supplying another person's playfab ID
  try {
    const verify = await axios.post(
      `https://${settings.TitleId}.playfabapi.com/Server/AuthenticateSessionTicket`,
      { SessionTicket: sessionTicket },
      { headers: settings.getAuthHeaders() }
    );
    const verifiedId = verify.data?.data?.UserInfo?.PlayFabId;
    if (verifiedId !== playfabId) {
      return res.status(403).json({ error: "Session ticket mismatch" });
    }
  } catch {
    return res.status(403).json({ error: "Invalid session ticket" });
  }

  // Fetch the codes list from GitHub
  let codes = {};
  try {
    const response = await axios.get("https://raw.githubusercontent.com/RealOrxify/nextjscsbackend/refs/heads/main/codes.txt");
    for (const line of response.data.split("\n")) {
      const [key, value] = line.split(":");
      if (key && value) codes[key.trim()] = value.trim();
    }
  } catch {
    return res.status(500).json({ error: "Failed to fetch codes list" });
  }

  if (!(code in codes))               return res.status(404).json({ result: "CodeInvalid" });
  if (codes[code] === "AlreadyRedeemed") return res.status(200).json({ result: "AlreadyRedeemed" });

  // Grant SR currency
  try {
    await axios.post(
      `https://${settings.TitleId}.playfabapi.com/Server/AddUserVirtualCurrency`,
      { PlayFabId: playfabId, VirtualCurrency: "SR", Amount: 1000 },
      { headers: settings.getAuthHeaders() }
    );
  } catch (err) {
    return res.status(500).json({ result: "PlayFabError", errorMessage: err.response?.data?.errorMessage || "Grant failed" });
  }

  return res.status(200).json({ result: "Success", itemID: code });
}

async function handleGetName(req, res) {
  return res.status(200).json({ result: `GORILLA${Math.floor(Math.random() * 9000) + 1000}` });
}

async function handlePhoton(req, res) {
  const AA = req.body || {};
  return res.status(200).json({
    ResultCode:             1,
    StatusCode:             200,
    Message:                "authed with photon",
    Result:                 0,
    UserId:                 AA.UserId,
    AppId:                  AA.AppId,
    AppVersion:             AA.AppVersion,
    Ticket:                 AA.Ticket,
    Token:                  AA.Token,
    Nonce:                  AA.Nonce,
    Platform:               AA.Platform,
    Username:               AA.Username,
    PlayerRoomCount:        AA.PlayerRoomCount,
    GorillaTagger:          AA.GorillaTagger,
    CosmeticAuthentication: AA.CosmeticAuthenticationV2,
    CosmeticsInRoom:        AA.CosmeticsInRoom,
    UpdatePlayerCosmetics:  AA.UpdatePlayerCosmetics,
    DLCOwnerShip:           AA.DLCOwnerShipV2,
    Currency:               AA.GorillaCorpCurrencyV1,
    RoomJoined:             AA.RoomJoined,
    VirtualStump:           AA.VirtualStump,
    DeadMonke:              AA.DeadMonke,
    GhostCounter:           AA.GhostCounter,
    BroadcastRoom:          AA.BroadcastMyRoomV2,
    TaggedClient:           AA.TaggedClient,
    TaggedDistance:         AA.TaggedDistance,
    RPCS:                   AA.RPCS,
  });
}

async function handleV3Photon(req, res) {
  const VALID_APPS = [settings.TitleId];

  // GET — simple echo auth (used by Photon dashboard checks)
  if (req.method === "GET") {
    const PlayerId = req.query?.username;
    const token    = req.query?.token;
    if (!PlayerId || !token) {
      return res.status(400).json({ resultCode: 3, message: "Failed to parse token from request", userId: null, nickname: null });
    }
    return res.status(200).json({ resultCode: 1, message: `User: ${PlayerId} Was Authed.`, username: PlayerId, token });
  }

  // POST — full PlayFab + Oculus validation
  const { AppId, AppVersion, Ticket, Token, Nonce, Platform } = req.body || {};

  if (!VALID_APPS.includes(AppId)) {
    return res.status(403).json({ ResultCode: 2, Message: "Invalid AppId parameter", Error: "BadRequest-WrongAppId" });
  }
  if (Platform !== "Quest") {
    return res.status(403).json({ ResultCode: 3, Message: "Platform Must Be Quest Fella", Error: "BadRequest-WrongPlatform" });
  }

  // Verify the PlayFab session ticket
  let sessionData;
  try {
    const r = await axios.post(
      `https://${settings.TitleId}.playfabapi.com/Server/AuthenticateSessionTicket`,
      { SessionTicket: Ticket },
      { headers: settings.getAuthHeaders() }
    );
    sessionData = r.data?.data?.UserInfo || {};
  } catch {
    return res.status(403).json({ ResultCode: 2, Message: "Invalid SessionTicket parameter", Error: "BadRequest-BadSessionTicket" });
  }

  const UserId           = sessionData.PlayFabId;
  const CustomId         = sessionData.CustomIdInfo?.CustomId;
  const OrgScopedCustomId = CustomId?.split("OCULUS")[1];

  if (!UserId || UserId.length !== 16) {
    return res.status(403).json({ ResultCode: 3, Message: "Failed UserId length check", Error: "BadRequest-BadUserId" });
  }

  // Verify the org-scoped oculus ID is real
  const oculusIdRes = await axios.get(
    `https://graph.oculus.com/${OrgScopedCustomId}?access_token=${settings.ApiKey}`,
    { headers: { "Content-Type": "application/json" } }
  ).catch((e) => e.response);

  if (oculusIdRes?.data?.error) {
    return res.status(403).json({ ResultCode: 3, Message: "Failed OrgScopedId check", Error: "BadRequest-InvalidOrgScopeId" });
  }

  const OculusId = oculusIdRes?.data?.id;

  // Verify the nonce
  const nonceRes = await axios.post(
    "https://graph.oculus.com/user_nonce_validate",
    { access_token: settings.ApiKey, nonce: Nonce, user_id: String(OculusId) },
    { headers: { "Content-Type": "application/json" } }
  ).catch((e) => e.response);

  const nonceData = nonceRes?.data || {};
  if (nonceRes?.status !== 200 || !("is_valid" in nonceData)) {
    return res.status(403).json({ ResultCode: 1, Message: "Failed Nonce Verification", Error: "BadRequest-InvalidNonce" });
  }

  return res.status(200).json({ ResultCode: 1, Message: "Yay Servers Work Ig", AppId, AppVersion, Nonce, OculusId, Ticket, Token, UserId });
}

async function handlePhotonAuthenticate(req, res) {
  const userId = req.query?.username;
  return res.status(200).json({ ResultCode: 1, UserId: userId?.toUpperCase() });
}

async function handlePhotonAuthenticatePcvr(req, res) {
  const userId = req.query?.username;
  try {
    await axios.post(
      `https://${settings.TitleId}.playfabapi.com/Server/GetUserAccountInfo`,
      { PlayFabId: userId },
      { headers: settings.getAuthHeaders() }
    );
  } catch (e) {
    return res.status(200).json({ resultCode: 0, message: `Something went wrong: ${e.message}`, userId: null, nickname: null });
  }
  return res.status(200).json({ ResultCode: 1, UserId: userId?.toUpperCase() });
}

// ─── Main Router ──────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const url = req.url?.split("?")[0] || "/";

  // Parse body if Vercel didn't do it already
  if (!req.body || typeof req.body === "string") {
    try { req.body = JSON.parse(req.body || "{}"); } catch { req.body = {}; }
  }

  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Root ──────────────────────────────────────────────────────
  if (url === "/" || url === "") return handleRoot(req, res);

  // ── POST-only routes ──────────────────────────────────────────
  const postOnly = {
    "/api/PlayFabAuthentication":    handlePlayFabAuthentication,
    "/api/CachePlayFabId":           handleCachePlayFabId,
    "/api/UploadGorillanalytics":    handleUploadGorillanalytics,
    "/api/ConsumeOculusIAP":         handleConsumeOculusIAP,
    "/api/ConsumeCodeItem":          handleConsumeCodeItem,
    "/api/photon":                   handlePhoton,
    "/api/photon/authenticate":      handlePhotonAuthenticate,
    "/api/photon/authenticate/pcvr": handlePhotonAuthenticatePcvr,
  };

  if (postOnly[url]) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed", message: "This endpoint only accepts POST requests fella" });
    }
    return postOnly[url](req, res);
  }

  // ── GET + POST routes ─────────────────────────────────────────
  if (url === "/api/TitleData")                return handleTitleData(req, res);
  if (url === "/api/TitleDataQuest")           return handleTitleDataQuest(req, res);
  if (url === "/api/CheckForBadName")          return handleCheckForBadName(req, res);
  if (url === "/api/GetAcceptedAgreements")    return handleGetAcceptedAgreements(req, res);
  if (url === "/api/SubmitAcceptedAgreements") return handleSubmitAcceptedAgreements(req, res);
  if (url === "/api/v2/GetName")               return handleGetName(req, res);
  if (url === "/api/v3/photon")                return handleV3Photon(req, res);

  return res.status(404).json({ error: "Not found" });
};
