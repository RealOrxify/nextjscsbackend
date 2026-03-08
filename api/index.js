// Backend for Can'tseeme24 - Converted to Vercel Serverless (Node.js)
// Original: Flask (Python) → Vercel API Route (Node.js + axios)

const axios = require("axios");

// ─── Config ───────────────────────────────────────────────────────────────────

const settings = {
  TitleId: "48B3E",
  SecretKey: "C75EOH35UT3MAUMYGZRTPFTMDJQMRCMNCUR48PGY1EWEO4FWB4",
  ApiKey: "OC|9657409904382923|a0171ee95a2f9b276cc941e7b11f6015",
  DiscordWebhook:
    "https://discord.com/api/webhooks/1473091883449323562/PYmbIc3I06v5FpFacmDCmgWi774501GbiKH6yk5EynvTi4hZqGkjBFQXPhWohIw4leaI",
  getAuthHeaders() {
    return {
      "content-type": "application/json",
      "X-SecretKey": this.SecretKey,
    };
  },
};
const badNames = [
  "JMAN", // add more if needed lol
];


// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "Unknown";
}

async function getOrgScopedId(oculusId) {
  if (!oculusId) return null;
  try {
    const url = `https://graph.oculus.com/${oculusId}?access_token=${settings.ApiKey}&fields=org_scoped_id`;
    const res = await axios.get(url, {
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    });
    return res.data?.org_scoped_id ?? null;
  } catch {
    return null;
  }
}

async function sendAuthWebhook({
  success,
  playerIp,
  customId = null,
  playfabId = null,
  oculusId = null,
  errorMessage = null,
  realIp = null,
}) {
  try {
    const ip = realIp || playerIp;
    let embedData;

    if (success) {
      embedData = {
        content: null,
        embeds: [
          {
            color: 65280,
            fields: [
              {
                name: "NORMAL FELLA LOGGED IN!",
                value: `\`\`\`ini\n[ Player's IP ]: ${ip}\n[Custom ID]: ${customId || "N/A"}\n[Player ID]: ${playfabId || "N/A"}\n[Orgscoped ID]: ${oculusId || "N/A"}\`\`\``,
              },
            ],
            author: { name: "Sigmer Auth" },
          },
        ],
      };
    } else {
      embedData = {
        content: null,
        embeds: [
          {
            color: 16711680,
            fields: [
              {
                name: "INVALID FELLA TRIED TO AUTH!",
                value: `\`\`\`ini\n[ Player's IP ]: ${ip}\n[Custom ID]: ${customId || "N/A"}\n[Orgscoped ID]: ${oculusId || "N/A"}\n[Error]: ${errorMessage || "Unknown Error"}\`\`\``,
              },
            ],
            author: { name: "Sigmer Auth" },
          },
        ],
      };
    }

    await axios.post(settings.DiscordWebhook, embedData, { timeout: 5000 });
  } catch (e) {
    console.error("Failed to send webhook:", e.message);
  }
}

async function discordMessage(message) {
  try {
    await axios.post(
      settings.DiscordWebhook,
      { content: typeof message === "string" ? message : JSON.stringify(message) },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("discordMessage error:", e.message);
  }
}

async function returnFunctionJson(data, funcname, funcparam = {}) {
  const userId =
    data?.FunctionParameter?.CallerEntityProfile?.Lineage?.TitlePlayerAccountId;

  try {
    const response = await axios.post(
      `https://${settings.TitleId}.playfabapi.com/Server/ExecuteCloudScript`,
      {
        PlayFabId: userId,
        FunctionName: funcname,
        FunctionParameter: funcparam,
      },
      { headers: settings.getAuthHeaders() }
    );
    return { body: response.data?.data?.FunctionResult ?? {}, status: response.status };
  } catch (err) {
    return { body: {}, status: err.response?.status || 500 };
  }
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

async function handleRoot(req, res) {
  if (req.method === "POST") {
    return res.status(200).send("The Backend Works");
  }

  // GET — serve the dashboard HTML
  const routes = [
    { path: "/", methods: ["GET", "POST"], endpoint: "main" },
    { path: "/api/PlayFabAuthentication", methods: ["POST"], endpoint: "playfab_authentication" },
    { path: "/api/CachePlayFabId", methods: ["POST"], endpoint: "cache_playfab_id" },
    { path: "/api/TitleData", methods: ["POST", "GET"], endpoint: "titledata" },
    { path: "/api/TitleDataQuest", methods: ["POST", "GET"], endpoint: "titled_data" },
    { path: "/api/CheckForBadName", methods: ["POST", "GET"], endpoint: "check_for_bad_name" },
    { path: "/api/GetAcceptedAgreements", methods: ["POST", "GET"], endpoint: "get_accepted_agreements" },
    { path: "/api/UploadGorillanalytics", methods: ["POST"], endpoint: "Upload_Gorillanalytics" },
    { path: "/api/SubmitAcceptedAgreements", methods: ["POST", "GET"], endpoint: "submit_accepted_agreements" },
    { path: "/api/ConsumeOculusIAP", methods: ["POST"], endpoint: "consume_oculus_iap" },
    { path: "/api/ConsumeCodeItem", methods: ["POST"], endpoint: "consume_code_item" },
    { path: "/api/v2/GetName", methods: ["POST", "GET"], endpoint: "GetNameIg" },
    { path: "/api/photon", methods: ["POST"], endpoint: "photonauth" },
    { path: "/api/v3/photon", methods: ["POST", "GET"], endpoint: "LuckysAnyUpdatePhotonAuth" },
    { path: "/api/photon/authenticate", methods: ["POST"], endpoint: "photon_authenticate" },
    { path: "/api/photon/authenticate/pcvr", methods: ["POST"], endpoint: "photon_authenticate_pcvr" },
  ];

  function sectionFor(path, endpoint) {
    const p = path.toLowerCase();
    const e = endpoint.toLowerCase();
    if (path === "/") return "Core";
    if (p.includes("photon") || e.includes("photon")) return "Photon";
    if (p.includes("playfabauthentication") || e.includes("auth")) return "Authentication";
    if (p.includes("titledata") || p.includes("agreements") || p.includes("badname") || p.includes("name")) return "Title & Profile";
    if (p.includes("consume") || p.includes("iap") || p.includes("codeitem")) return "Commerce";
    if (p.includes("gorillanalytics")) return "Telemetry";
    if (p.includes("cacheplayfabid") || p.includes("playfab")) return "PlayFab";
    return "Misc";
  }

  const sectionOrder = ["Core", "Authentication", "Photon", "PlayFab", "Title & Profile", "Commerce", "Telemetry", "Misc"];
  const grouped = Object.fromEntries(sectionOrder.map((n) => [n, []]));

  for (const r of routes.sort((a, b) => a.path.localeCompare(b.path))) {
    const section = sectionFor(r.path, r.endpoint);
    (grouped[section] = grouped[section] || []).push({ ...r, isGet: r.methods.includes("GET") });
  }

  const sections = sectionOrder
    .filter((n) => grouped[n]?.length)
    .map((n) => ({ name: n, routes: grouped[n], count: grouped[n].length }));

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>cantseeme24 Backend</title>
  <style>
    :root{--bg:#0b0f14;--panel:#111922;--panel-2:#0e151d;--text:#d9e2ec;--muted:#8aa1b5;--line:#1f2a37;--accent:#3ddc97;--accent-2:#2f81f7;--get:#238636;--post:#1f6feb}
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
      ${sections.map((s) => `<a class="chip" href="#${s.name.toLowerCase().replace(/ /g, "-").replace("&", "and")}">${s.name} <span class="chip-count">(${s.count})</span></a>`).join("\n      ")}
    </nav>
    ${sections
      .map(
        (s) => `
    <section class="section" id="${s.name.toLowerCase().replace(/ /g, "-").replace("&", "and")}">
      <h2 class="section-title">${s.name} <span class="chip-count">(${s.count})</span></h2>
      <div class="card">
        <table>
          <thead><tr><th>Route</th><th>Methods</th><th>Endpoint</th></tr></thead>
          <tbody>
            ${s.routes
              .map(
                (r) => `
            <tr>
              <td>${r.isGet ? `<a class="path" href="${r.path}" target="_blank" rel="noopener noreferrer">${r.path}</a>` : `<span class="method-raw">${r.path}</span>`}</td>
              <td>${r.methods.map((m) => `<span class="badge ${m.toLowerCase()}">${m}</span>`).join("")}</td>
              <td><code>${r.endpoint}</code></td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>`
      )
      .join("")}
    <p class="footer">GET routes are clickable. POST-only routes are listed for direct API testing.</p>
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

  const orgScopedId = await getOrgScopedId(rjson.OculusId);
  const requiredFields = ["CustomId", "Nonce", "AppId", "Platform", "OculusId"];
  const missingFields = requiredFields.filter((f) => !rjson[f]);

  if (missingFields.length) {
    await sendAuthWebhook({
      success: false,
      playerIp,
      realIp,
      customId: rjson.CustomId,
      oculusId: orgScopedId,
      errorMessage: `BadRequest-No${missingFields[0]}`,
    });
    return res.status(400).json({
      Message: `Missing parameter(s): ${missingFields.join(", ")}`,
      Error: `BadRequest-No${missingFields[0]}`,
    });
  }

  if (rjson.AppId !== settings.TitleId) {
    await sendAuthWebhook({
      success: false,
      playerIp,
      realIp,
      customId: rjson.CustomId,
      oculusId: orgScopedId,
      errorMessage: "BadRequest-AppIdMismatch",
    });
    return res.status(400).json({ Message: "Request sent for the wrong App ID", Error: "BadRequest-AppIdMismatch" });
  }

  if (!rjson.CustomId.startsWith("OC") && !rjson.CustomId.startsWith("PI")) {
    await sendAuthWebhook({
      success: false,
      playerIp,
      realIp,
      customId: rjson.CustomId,
      oculusId: orgScopedId,
      errorMessage: "BadRequest-IncorrectPrefix",
    });
    return res.status(400).json({ Message: "Bad request", Error: "BadRequest-IncorrectPrefix" });
  }

  await discordMessage(rjson);

  let loginRequest;
  try {
    loginRequest = await axios.post(
      `https://${settings.TitleId}.playfabapi.com/Server/LoginWithServerCustomId`,
      { ServerCustomId: rjson.CustomId, CreateAccount: true },
      { headers: settings.getAuthHeaders() }
    );
  } catch (err) {
    const errData = err.response?.data || {};
    const status = err.response?.status || 500;

    if (status === 403 && errData.errorCode === 1002) {
      const banMessage = errData.errorMessage || "No ban message provided.";
      const banDetails = errData.errorDetails || {};
      const banExpirationKey = Object.keys(banDetails)[0] || null;
      const banExpirationList = banDetails[banExpirationKey] || [];
      const banExpiration = banExpirationList[0] || "No expiration date provided.";
      await sendAuthWebhook({ success: false, playerIp, realIp, customId: rjson.CustomId, oculusId: orgScopedId, errorMessage: banMessage });
      return res.status(403).json({ BanMessage: banExpirationKey, BanExpirationTime: banExpiration });
    }

    const errorMessage = errData.errorMessage || "An error occurred.";
    await sendAuthWebhook({ success: false, playerIp, realIp, customId: rjson.CustomId, oculusId: orgScopedId, errorMessage });
    return res.status(status).json({ Error: "PlayFab Error", Message: errorMessage });
  }

  const data = loginRequest.data?.data;
  const sessionTicket = data?.SessionTicket;
  const entityToken = data?.EntityToken?.EntityToken;
  const playfabId = data?.PlayFabId;
  const entityType = data?.EntityToken?.Entity?.Type;
  const entityId = data?.EntityToken?.Entity?.Id;

  await axios
    .post(
      `https://${settings.TitleId}.playfabapi.com/Server/LinkServerCustomId`,
      { ForceLink: true, PlayFabId: playfabId, ServerCustomId: rjson.CustomId },
      { headers: settings.getAuthHeaders() }
    )
    .catch(() => {});

  await sendAuthWebhook({ success: true, playerIp, realIp, customId: rjson.CustomId, playfabId, oculusId: orgScopedId });

  return res.status(200).json({ PlayFabId: playfabId, SessionTicket: sessionTicket, EntityToken: entityToken, EntityId: entityId, EntityType: entityType });
}

async function handleCachePlayFabId(req, res) {
  return res.status(200).json({ Message: "Success" });
}

async function handleTitleData(req, res) {
  return res.status(200).json({
    AutoMuteCheckedHours: { hours: 169 },
    AutoName_Adverbs: ["Cool", "Fine", "Bald", "Bold", "Half", "Only", "Calm", "Fab", "Ice", "Mad", "Rad", "Big", "New", "Old", "Shy"],
    AutoName_Nouns: ["Gorilla", "Chicken", "Darling", "Sloth", "King", "Queen", "Royal", "Major", "Actor", "Agent", "Elder", "Honey", "Nurse", "Doctor", "Rebel", "Shape", "Ally", "Driver", "Deputy"],
    CreditsData: [
      { Title: "<color=blue>UPDATE MAKERS/PLAYFAB MANAGERS</color>", Entries: ["L1RSON (UPDATE MAKER/PLAYFAB MANAGER)", "KITTY (OWNER/PLAYFAB MANAGER)", "Z3N (OWNER)"] },
      { Title: "<color=yellow>CREDITS TO</color>", Entries: ["TABLE", "L1RSON", "S4GE", "IRES", "QUIZX"] },
      { Title: "<color=red>GAY FELLAS</color>", Entries: ["DESK", "TABLE", "IRES", "RASP", "KEN"] },
    ],
    BundleBoardSign: "<color=#ff4141>DISCORD.GG/Vnkh3Hr9RE</color>",
    BundleKioskButton: "<color=#ff4141>DISCORD.GG/Vnkh3Hr9RE</color>",
    BundleKioskSign: "<color=#ff4141>DISCORD.GG/Vnkh3Hr9RE</color>",
    BundleLargeSign: "<color=#ff4141>DISCORD.GG/Vnkh3Hr9RE</color>",
    EmptyFlashbackText: "FLOOR TWO NOW OPEN\n FOR BUSINESS\n\nSTILL SEARCHING FOR\nBOX LABELED 2021",
    EnableCustomAuthentication: true,
    GorillanalyticsChance: 4320,
    LatestPrivacyPolicyVersion: "2024.09.20",
    LatestTOSVersion: "2024.09.20",
    MOTD: "<color=#bb29ff>[ WELCOME TO ORIGINAL TAG REVIVED ]</color>\n <color=#07dde8>CHRISTMUH 23!</color>\n<color=#ffff00>CREATOR/FOUNDER : Z3N</color>\n<color=#969696>CREDITS TO: IRES, L1RSON, S4GE, SCREAMINGCAT, Z3N, RASP, TABLE</color>\n<color=#ff8800>DISCORD.GG/Vnkh3Hr9RE</color>\n<color=#000000>CHANGE YOUR NAME FROM oldgorilla AS IT'S BANNABLE!</color>",
    SeasonalStoreBoardSign: "<color=yellow>RATE THE GAME 5 STARS!</color>\n\n<color=aqua>.GG/Vnkh3Hr9RE",
    "TOS_2024.09.20": "DISCORD.GG/Vnkh3Hr9RE",
    TOBAlreadyOwnCompTxt: "DISCORD.GG/Vnkh3Hr9RE",
    TOBAlreadyOwnPurchaseBundle: "RETRO",
    TOBDefCompTxt: "DISCORD.GG/Vnkh3Hr9RE",
    TOBDefPurchaseBtnDefTxt: "RETRO",
    UseLegacyIAP: false,
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
    return res.status(err.response?.status || 500).json({ error: "Failed to fetch data" });
  }
}

async function handleCheckForBadName(req, res) {
  const body = req.body || {};
  const args = body?.FunctionArgument || body;
  const name = args?.name;

  if (badNames.includes(name)) {
    return res.status(200).json({ result: 1 });
  }

  return res.status(200).json({ error: "Method not allowed" });
}

async function handleGetAcceptedAgreements(req, res) {
  const rjson = req.body?.FunctionResult;
  return res.status(200).json(rjson);
}

async function handleUploadGorillanalytics(req, res) {
  const data = req.body;
  if (!data) return res.status(400).json({ error: "Invalid data" });

  const fr = data.FunctionResult || {};
  const embed = {
    title: "New Upload Data",
    color: 5814783,
    fields: [
      { name: "Version", value: String(fr.version ?? "N/A"), inline: true },
      { name: "Upload Chance", value: String(fr.upload_chance ?? "N/A"), inline: true },
      { name: "Map", value: String(fr.map ?? "N/A"), inline: true },
      { name: "Mode", value: String(fr.mode ?? "N/A"), inline: true },
      { name: "Queue", value: String(fr.queue ?? "N/A"), inline: true },
      { name: "Player Count", value: String(fr.player_count ?? "N/A"), inline: true },
      { name: "Position", value: `(${fr.pos_x ?? "N/A"}, ${fr.pos_y ?? "N/A"}, ${fr.pos_z ?? "N/A"})`, inline: false },
      { name: "Velocity", value: `(${fr.vel_x ?? "N/A"}, ${fr.vel_y ?? "N/A"}, ${fr.vel_z ?? "N/A"})`, inline: false },
      { name: "Cosmetics Owned", value: String(fr.cosmetics_owned ?? "None"), inline: false },
      { name: "Cosmetics Worn", value: String(fr.cosmetics_worn ?? "None"), inline: false },
    ],
  };

  try {
    const response = await axios.post(settings.DiscordWebhook, { embeds: [embed] }, { headers: { "Content-Type": "application/json" } });
    if (response.status === 204) return res.status(200).json({ status: "Success" });
    return res.status(500).json({ error: "Failed to send embed" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send embed", response: err.message });
  }
}

async function handleSubmitAcceptedAgreements(req, res) {
  const rjson = req.body?.FunctionResult;
  return res.status(200).json(rjson);
}

async function handleConsumeOculusIAP(req, res) {
  const { userToken, userID, nonce, sku } = req.body || {};
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
  if (!code || !playfabId || !sessionTicket) return res.status(400).json({ error: "Missing parameters" });

  const rawUrl = "https://github.com/redapplegtag/backendsfrr"; // replace with your raw GitHub URL
  let lines, codes;
  try {
    const response = await axios.get(rawUrl);
    lines = response.data.split("\n");
    codes = {};
    for (const line of lines) {
      const split = line.split(":");
      if (split.length === 2) codes[split[0].trim()] = split[1].trim();
    }
  } catch {
    return res.status(500).json({ error: "GitHub fetch failed" });
  }

  if (!(code in codes)) return res.status(404).json({ result: "CodeInvalid" });
  if (codes[code] === "AlreadyRedeemed") return res.status(200).json({ result: "AlreadyRedeemed" });

  try {
    const grantResponse = await axios.post(
      `https://${settings.TitleId}.playfabapi.com/Admin/GrantItemsToUsers`,
      {
        ItemGrants: ["dis da cosmetics", "anotehr cposmetic", "anotehr"].map((itemId) => ({
          PlayFabId: playfabId,
          ItemId: itemId,
          CatalogVersion: "DLC",
        })),
      },
      { headers: settings.getAuthHeaders() }
    );
    if (grantResponse.status !== 200) {
      return res.status(500).json({ result: "PlayFabError", errorMessage: grantResponse.data?.errorMessage || "Grant failed" });
    }
  } catch (err) {
    return res.status(500).json({ result: "PlayFabError", errorMessage: err.response?.data?.errorMessage || "Grant failed" });
  }

  return res.status(200).json({ result: "Success", itemID: code, playFabItemName: codes[code] });
}

async function handleGetName(req, res) {
  return res.status(200).json({ result: `GORILLA${Math.floor(Math.random() * 9000) + 1000}` });
}

async function handlePhoton(req, res) {
  const AA = req.body || {};
  return res.status(200).json({
    ResultCode: 1,
    StatusCode: 200,
    Message: "authed with photon",
    Result: 0,
    UserId: AA.UserId,
    AppId: AA.AppId,
    AppVersion: AA.AppVersion,
    Ticket: AA.Ticket,
    Token: AA.Token,
    Nonce: AA.Nonce,
    Platform: AA.Platform,
    Username: AA.Username,
    PlayerRoomCount: AA.PlayerRoomCount,
    GorillaTagger: AA.GorillaTagger,
    CosmeticAuthentication: AA.CosmeticAuthenticationV2,
    CosmeticsInRoom: AA.CosmeticsInRoom,
    UpdatePlayerCosmetics: AA.UpdatePlayerCosmetics,
    DLCOwnerShip: AA.DLCOwnerShipV2,
    Currency: AA.GorillaCorpCurrencyV1,
    RoomJoined: AA.RoomJoined,
    VirtualStump: AA.VirtualStump,
    DeadMonke: AA.DeadMonke,
    GhostCounter: AA.GhostCounter,
    BroadcastRoom: AA.BroadcastMyRoomV2,
    TaggedClient: AA.TaggedClient,
    TaggedDistance: AA.TaggedDistance,
    RPCS: AA.RPCS,
  });
}

async function handleV3Photon(req, res) {
  const AuthTicketUrl = `https://${settings.TitleId}.playfabapi.com/Server/AuthenticateSessionTicket`;
  const VALID_APPS = [settings.TitleId];

  if (req.method === "GET") {
    const PlayerId = req.query.username;
    const token = req.query.token;
    if (!PlayerId || !token) {
      return res.status(400).json({ resultCode: 3, message: "Failed to parse token from request", userId: null, nickname: null });
    }
    return res.status(200).json({ resultCode: 1, message: `User: ${PlayerId} Was Authed.`, username: PlayerId, token });
  }

  // POST
  const newData = req.body || {};
  const { AppId, AppVersion, Ticket, Token, Nonce, Platform } = newData;

  if (!VALID_APPS.includes(AppId)) {
    return res.status(403).json({ ResultCode: 2, Message: "Invalid AppId parameter", Error: "BadRequest-WrongAppId" });
  }

  if (Platform !== "Quest") {
    return res.status(403).json({ Error: "Bad request", ResultCode: 3, Message: "Platform Must Be Quest Fella" });
  }

  let AuthSessionTicketReq;
  try {
    AuthSessionTicketReq = await axios.post(
      AuthTicketUrl,
      { SessionTicket: Ticket },
      { headers: settings.getAuthHeaders() }
    );
  } catch (err) {
    return res.status(403).json({ ResultCode: 2, Message: "Invalid SessionTicket parameter", Error: "BadRequest-BadSessionTicket" });
  }

  const getdata = AuthSessionTicketReq.data?.data?.UserInfo || {};
  const UserId = getdata.PlayFabId;
  const CustomId = getdata.CustomIdInfo?.CustomId;
  const OrgScopedCustomId = CustomId?.split("OCULUS")[1];

  const GetOculusIdReq = await axios
    .get(`https://graph.oculus.com/${OrgScopedCustomId}?access_token=${settings.ApiKey}`, {
      headers: { "Content-Type": "application/json" },
    })
    .catch((e) => e.response);

  if (GetOculusIdReq?.data?.error) {
    return res.status(403).json({ ResultCode: 3, Message: "Did Not Pass OrgScopeId Checker", Error: "BadRequest-IvalidOrgScopeId" });
  }

  if (!UserId || UserId.length !== 16) {
    return res.status(403).json({ ResultCode: 3, Message: "Did Not UserId Length Checker", Error: "BadRequest-BadUserId" });
  }

  const OculusId = GetOculusIdReq?.data?.id;

  const VerifyNonceReq = await axios
    .post(
      "https://graph.oculus.com/user_nonce_validate",
      { access_token: settings.ApiKey, nonce: Nonce, user_id: String(OculusId) },
      { headers: { "Content-Type": "application/json" } }
    )
    .catch((e) => e.response);

  const nonceJson = VerifyNonceReq?.data || {};
  if (VerifyNonceReq?.status !== 200 || !("is_valid" in nonceJson)) {
    return res.status(403).json({ ResultCode: 1, Message: "Failed Nonce Verification", Error: "BadRequest-InvalidNonce" });
  }

  return res.status(200).json({ ResultCode: 1, Message: "Yay Servers Work Ig", AppId, AppVersion, Nonce, OculusId, Ticket, Token, UserId });
}

async function handlePhotonAuthenticate(req, res) {
  const userId = req.query.username;
  const token = req.query.token;
  return res.status(200).json({ ResultCode: 1, UserId: userId?.toUpperCase() });
}

async function handlePhotonAuthenticatePcvr(req, res) {
  const userId = req.query.username;
  try {
    const response = await axios.post(
      `https://${settings.TitleId}.playfabapi.com/Server/GetUserAccountInfo`,
      { PlayFabId: userId },
      { headers: { "content-type": "application/json", "X-SecretKey": settings.SecretKey } }
    );
    // nickname extraction kept for future use
    // const nickname = response.data?.UserInfo?.UserAccountInfo?.Username || null;
  } catch (e) {
    return res.status(200).json({ resultCode: 0, message: `Something went wrong: ${e.message}`, userId: null, nickname: null });
  }
  return res.status(200).json({ ResultCode: 1, UserId: userId?.toUpperCase() });
}

// ─── Main Router ──────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  const url = req.url?.split("?")[0] || "/";
  if (!req.body || typeof req.body === "string") {
    try { req.body = JSON.parse(req.body || "{}"); } catch { req.body = {}; }
  }

  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);


  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (url === "/" || url === "") return handleRoot(req, res);

  if (url === "/api/PlayFabAuthentication") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed", message: "This endpoint only accepts POST requests fella" });
    return handlePlayFabAuthentication(req, res);
  }
  if (url === "/api/CachePlayFabId") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed", message: "This endpoint only accepts POST requests fella" });
    return handleCachePlayFabId(req, res);
  }
  if (url === "/api/UploadGorillanalytics") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed", message: "This endpoint only accepts POST requests fella" });
    return handleUploadGorillanalytics(req, res);
  }
  if (url === "/api/ConsumeOculusIAP") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed", message: "This endpoint only accepts POST requests fella" });
    return handleConsumeOculusIAP(req, res);
  }
  if (url === "/api/ConsumeCodeItem") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed", message: "This endpoint only accepts POST requests fella" });
    return handleConsumeCodeItem(req, res);
  }
  if (url === "/api/photon") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed", message: "This endpoint only accepts POST requests fella" });
    return handlePhoton(req, res);
  }
  if (url === "/api/photon/authenticate") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed", message: "This endpoint only accepts POST requests fella" });
    return handlePhotonAuthenticate(req, res);
  }
  if (url === "/api/photon/authenticate/pcvr") {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed", message: "This endpoint only accepts POST requests fella" });
    return handlePhotonAuthenticatePcvr(req, res);
  }

  // these accept both GET and POST so no method restriction needed
  if (url === "/api/TitleData") return handleTitleData(req, res);
  if (url === "/api/TitleDataQuest") return handleTitleDataQuest(req, res);
  if (url === "/api/CheckForBadName") return handleCheckForBadName(req, res);
  if (url === "/api/GetAcceptedAgreements") return handleGetAcceptedAgreements(req, res);
  if (url === "/api/SubmitAcceptedAgreements") return handleSubmitAcceptedAgreements(req, res);
  if (url === "/api/v2/GetName") return handleGetName(req, res);
  if (url === "/api/v3/photon") return handleV3Photon(req, res);

  return res.status(404).json({ error: "Not found" });
};
