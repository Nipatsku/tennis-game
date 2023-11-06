const urlServer = `${window.location.origin}`;
const urlWebsocket = `ws://${window.location.hostname}:3010`;
console.log({ urlServer, urlWebsocket });
const socket = new WebSocket(urlWebsocket);
let connected = false;
socket.addEventListener("open", (event) => {
  connected = true;
});
socket.addEventListener("close", (event) => {
  connected = false;
});
const waitConnected = async () => {
  while (!connected) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

const soundTrack = document.getElementById("soundtrack");
const squeaks = document.getElementById("squeaks");
document.body.addEventListener("click", (e) => {
  soundTrack.play();
  squeaks.play();
});
const soundEffects = document.getElementById("sound-effects");
const soundEffects2 = document.getElementById("sound-effects2");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const bounds = canvas.getBoundingClientRect();
canvas.width = bounds.width;
canvas.height = bounds.height;
const courtPositions = {
  top: bounds.height * 0.2,
  horizontalCenter: bounds.width * 0.5,
  width: bounds.width * 0.5,
  bottom: bounds.height * 0.8,
};
courtPositions.height = courtPositions.bottom - courtPositions.top;
const scale = Math.sqrt(bounds.width * bounds.height);
const doublesWidth = 0.75;

const applySetting = (settings) => {
  sendMsg("settings", settings);
};
const settingsButton = document.getElementById("settings");
const inputTeam1name = document.getElementById("setting-team1name");
inputTeam1name.onchange = () =>
  applySetting({ team1Name: inputTeam1name.value });
const inputTeam2name = document.getElementById("setting-team2name");
inputTeam2name.onchange = () =>
  applySetting({ team2Name: inputTeam2name.value });
const inputBallSpeed = document.getElementById("setting-ballSpeed");
inputBallSpeed.onchange = () =>
  applySetting({ ballSpeed: (2 * Number(inputBallSpeed.value)) / 100 });
const inputPlayerSpeed = document.getElementById("setting-playerSpeed");
inputPlayerSpeed.onchange = () =>
  applySetting({ playerSpeed: (2 * Number(inputPlayerSpeed.value)) / 100 });
const inputSweetSpotSize = document.getElementById("setting-sweetSpotSize");
inputSweetSpotSize.onchange = () =>
  applySetting({ sweetSpotSize: (2 * Number(inputSweetSpotSize.value)) / 100 });
const inputSFXVolume = document.getElementById("setting-sfxVolume");
inputSFXVolume.onchange = () =>
  applySetting({ sfxVolume: (1 * Number(inputSFXVolume.value)) / 100 });
const inputMusicVolume = document.getElementById("setting-musicVolume");
inputMusicVolume.onchange = () =>
  applySetting({ musicVolume: (1 * Number(inputMusicVolume.value)) / 100 });
const inputBotCount = document.getElementById("setting-botCount");
inputBotCount.onchange = () =>
  applySetting({ botCount: Number(inputBotCount.value) });
const inputDisplaySweetSpot = document.getElementById(
  "setting-displaySweetSpot"
);
inputDisplaySweetSpot.onchange = () =>
  applySetting({ displaySweetSpot: inputDisplaySweetSpot.checked });
const inputDisplayAim = document.getElementById("setting-displayAim");
inputDisplayAim.onchange = () =>
  applySetting({ displayAim: inputDisplayAim.checked });
const inputAllowLob = document.getElementById("setting-allowLob");
inputAllowLob.onchange = () =>
  applySetting({ lobAllowed: inputAllowLob.checked });
const inputResetScore = document.getElementById("setting-resetScore");
inputResetScore.onclick = () => {
  sendMsg("reset", {});
};
let settingsVisible = false;
settingsButton.onclick = () => {
  settingsVisible = !settingsVisible;
  document.getElementById("settings-overlay").style.display = settingsVisible
    ? "block"
    : "none";
};

const images = [
  "ready_0",
  "prepare_0",
  "prepare_volley_0",
  "prepare_lob_0",
  "hit_0",
  "hit_lob_0",
].map((label) => {
  const url = `${label}.png`;
  const image = new Image();
  image.src = url;
  return { label, image };
});
const getImage = (label) => images.find((img) => img.label === label).image;
const imgPlayerReady = getImage("ready_0");
const imgPlayerVolleyPrepare = getImage("prepare_volley_0");
const sendMsg = async (url, msg) => {
  const reply = await fetch(`${urlServer}/${url}`, {
    method: "POST",
    body: JSON.stringify(msg),
    headers: { "Content-Type": "application/json" },
  }).then((r) => r.json());
  return reply;
};
const depthFactor = (y) => {
  const dist = 1 - y;
  //   const depthFactor = 1
  const depthFactor = 1 + dist / 2;
  return depthFactor;
};
const coordTennis2Canvas = (arg1, arg2, arg3) => {
  const x = typeof arg1 === "object" ? arg1.x : arg1;
  const y = typeof arg1 === "object" ? arg1.y : arg2;
  const z = (typeof arg1 === "object" ? arg1.z : arg3) || 0;
  const d = depthFactor(y);
  return [
    courtPositions.horizontalCenter + (x * courtPositions.width) / 2 / d,
    courtPositions.top +
      ((y + 1) / 2) * courtPositions.height -
      (z * bounds.height * 0.1) / d,
  ];
};
const drawImage = (
  image,
  arg2,
  arg3,
  arg4,
  width,
  height,
  rotDegZ = 0,
  rotDegY = 0
) => {
  const argx = typeof arg2 === "object" ? arg2.x : arg2;
  const argy = typeof arg2 === "object" ? arg2.y : arg3;
  const argz = (typeof arg2 === "object" ? arg2.z : arg4) || 0;
  const pos = coordTennis2Canvas(argx, argy, argz);
  const x = pos[0] - width / 2;
  const y = pos[1] - height;
  ctx.save();
  ctx.setTransform(
    new DOMMatrix()
      .translateSelf(x + width / 2, y + height / 2)
      .rotateSelf(0, rotDegY, rotDegZ)
  );
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
};
const drawPlayer = (player) => {
  const playerOrientation = state.ball
    ? Math.sign(state.ball.position.x - player.position.x)
    : 1;
  const isPreparing = player.preparing;
  const isHitting = player.hitting;
  const isMoving =
    player.moveDirection?.x !== 0 || player.moveDirection?.y !== 0;
  const rotZ = isMoving
    ? 15 *
      Math.sin((Date.now() - (player.movingStart || 0)) / 100) *
      playerOrientation
    : isPreparing
    ? (10 + 10 * -Math.cos((Date.now() - (player.preparingStart || 0)) / 250)) *
      playerOrientation
    : isHitting
    ? 5 *
      Math.sin((Date.now() - (player.hittingStart || 0)) / 50) *
      playerOrientation
    : 3 * Math.sin(Date.now() / 250);
  const rotY = playerOrientation > 0 ? 0 : 180;
  const image =
    isHitting && player.lob
      ? getImage("hit_lob_0")
      : isHitting
      ? getImage("hit_0")
      : isPreparing && player.volley
      ? getImage("prepare_volley_0")
      : isPreparing && player.lob
      ? getImage("prepare_lob_0")
      : isPreparing
      ? getImage("prepare_0")
      : getImage("ready_0");
  const d = depthFactor(player.position.y);
  const playerHeightZ = (1.7 * 0.91) / 1;

  const height =
    ((image.height / imgPlayerReady.height) *
      (playerHeightZ * bounds.height * 0.1)) /
    d;
  const width = image.width * (height / image.height);
  const playerPosPixels = coordTennis2Canvas(
    player.position.x,
    player.position.y,
    0
  );
  const sweetSpotPixels = [
    playerPosPixels[0] +
      (!player.volley ? 80 : 70) * (height / image.height) * playerOrientation,
    playerPosPixels[1] -
      height *
        (imgPlayerReady.height / image.height) *
        (!player.volley ? 0.6 : 1.2),
  ];
  const sweetSpot = {
    // reverse coordTennis2Canvas x
    x:
      ((sweetSpotPixels[0] - courtPositions.horizontalCenter) * 2 * d) /
      courtPositions.width,
    y: player.position.y,
    z: !player.volley ? 1 : 1.7,
  };
  if (isPreparing) {
    sendMsg("sweet-spot", { ...player, sweetSpot });
  }
  const sweetSpotRadius = (state.sweetSpotSize * (0.0075 * scale)) / d;
  if (state.displaySweetSpot) {
    // line from sweetspot to ground position
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sweetSpotPixels[0], sweetSpotPixels[1] + sweetSpotRadius);
    ctx.lineTo(sweetSpotPixels[0], playerPosPixels[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    // sweet spot
    ctx.fillStyle = "rgba(255,0,0,0.5)";
    ctx.beginPath();
    ctx.arc(
      sweetSpotPixels[0],
      sweetSpotPixels[1],
      sweetSpotRadius,
      0,
      2 * Math.PI
    );
    ctx.fill();
  }
  // player name
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.font = `${0.01 * scale}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.strokeText(
    player.name || "Player",
    playerPosPixels[0],
    playerPosPixels[1] + 10
  );
  ctx.fillText(
    player.name || "Player",
    playerPosPixels[0],
    playerPosPixels[1] + 10
  );
  // player
  drawImage(
    image,
    player.position.x,
    player.position.y,
    player.position.z,
    width,
    height,
    rotZ,
    rotY
  );
  if (player.aim && state.displayAim) {
    // visualize aim target
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sweetSpotPixels[0], sweetSpotPixels[1] + sweetSpotRadius);
    ctx.lineTo(...coordTennis2Canvas(player.aim.x, player.aim.y));
    ctx.stroke();
  }
};

let state = { players: [], ball: undefined };
const plot = () => {
  // Outside court ground fill
  ctx.fillStyle = "#80b070";
  ctx.rect(0, 0, bounds.width, bounds.height);
  ctx.fill();
  // Court fill
  ctx.fillStyle = "#748d70";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(...coordTennis2Canvas(-1, -1));
  ctx.lineTo(...coordTennis2Canvas(1, -1));
  ctx.lineTo(...coordTennis2Canvas(1, 1));
  ctx.lineTo(...coordTennis2Canvas(-1, 1));
  ctx.lineTo(...coordTennis2Canvas(-1, -1));
  ctx.fill();
  ctx.stroke();
  // Service lines
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(...coordTennis2Canvas(-doublesWidth, 0.5));
  ctx.lineTo(...coordTennis2Canvas(doublesWidth, 0.5));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(...coordTennis2Canvas(-doublesWidth, -0.5));
  ctx.lineTo(...coordTennis2Canvas(doublesWidth, -0.5));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(...coordTennis2Canvas(0, 0.5));
  ctx.lineTo(...coordTennis2Canvas(0, -0.5));
  ctx.stroke();
  // doubles lines
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(...coordTennis2Canvas(-doublesWidth, -1));
  ctx.lineTo(...coordTennis2Canvas(-doublesWidth, 1));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(...coordTennis2Canvas(doublesWidth, -1));
  ctx.lineTo(...coordTennis2Canvas(doublesWidth, 1));
  ctx.stroke();
  if (state.lastContact) {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    const ballSize = Math.max(
      (0.0075 * scale) / depthFactor(state.lastContact.y),
      1
    );
    ctx.arc(...coordTennis2Canvas(state.lastContact), ballSize, 0, 2 * Math.PI);
    ctx.fill();
  }
  // team names on floor
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.font = `${0.02 * scale}px serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  const posCorner1 = coordTennis2Canvas(-1, -1, 0);
  const side1Team =
    state.players.find((player) => player.side === 1)?.team || 1;
  ctx.fillText(
    side1Team === 1 ? state.team1Name : state.team2Name,
    posCorner1[0] - 20,
    posCorner1[1]
  );
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  const posCorner2 = coordTennis2Canvas(1, 1, 0);
  const side2Team = side1Team === 1 ? 2 : 1;
  ctx.fillText(
    side2Team === 1 ? state.team1Name : state.team2Name,
    posCorner2[0] + 20,
    posCorner2[1]
  );
  // players on further from camera than net
  state.players
    .filter((p) => p.position.y < 0)
    .forEach((p) => {
      drawPlayer(p);
    });
  // net
  ctx.fillStyle = "#000000aa";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(...coordTennis2Canvas(-1.3, 0));
  ctx.lineTo(...coordTennis2Canvas(-1.3, 0, 1));
  ctx.lineTo(...coordTennis2Canvas(+1.3, 0, 1));
  ctx.lineTo(...coordTennis2Canvas(+1.3, 0, 0));
  ctx.lineTo(...coordTennis2Canvas(-1.3, 0));
  ctx.fill();
  ctx.stroke();
  // players on closer to camera than net
  state.players
    .filter((p) => p.position.y >= 0)
    .forEach((p) => {
      drawPlayer(p);
    });
  if (state.ball) {
    // line from ball to ground position
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(
      ...coordTennis2Canvas(state.ball.position.x, state.ball.position.y, 0)
    );
    ctx.lineTo(...coordTennis2Canvas(state.ball.position));
    ctx.stroke();
    ctx.setLineDash([]);
    // ball
    ctx.fillStyle = "#ebfb3a";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const ballSize = Math.max(
      (0.0075 * scale) / depthFactor(state.ball.position.y),
      1
    );
    ctx.arc(
      ...coordTennis2Canvas(state.ball.position),
      ballSize,
      0,
      2 * Math.PI
    );
    ctx.fill();
    ctx.stroke();
  }
  if (state.victory) {
    // victory info
    const c = HSVtoRGB(window.performance.now() / 5000, 1, 1);
    ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 4;
    ctx.font = `${0.08 * scale}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const text = `${
      state.victory.team === 1 ? state.team1Name : state.team2Name
    } wins!`;
    ctx.strokeText(text, bounds.width / 2, 10);
    ctx.fillText(text, bounds.width / 2, 10);
  } else if (state.serving) {
    // serve information
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.font = `${0.02 * scale}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const text = state.serving.player.name
      ? `${state.serving.player.name} to serve`
      : `Team ${state.serving.player.team} to serve`;
    ctx.strokeText(text, bounds.width / 2, 10);
    ctx.fillText(text, bounds.width / 2, 10);
  } else if (state.changeSides) {
    // show warning of sides changing
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.font = `${0.04 * scale}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const text = "Rotating sides!";
    ctx.strokeText(text, bounds.width / 2, 10);
    ctx.fillText(text, bounds.width / 2, 10);
  }
  // team names and score
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.font = `${0.04 * scale}px serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const textTeamNames = `${state.team1Name} vs ${state.team2Name}`;
  ctx.strokeText(textTeamNames, 10, 10);
  ctx.fillText(textTeamNames, 10, 10);
  const textScore = state.score ? `${state.score[0]} - ${state.score[1]}` : "";
  ctx.strokeText(textScore, 10, 10 + 0.04 * scale);
  ctx.fillText(textScore, 10, 10 + 0.04 * scale);
};
plot();

let squeaksVolume = 0;
(async () => {
  await waitConnected();
  console.log("Connected");
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    state = msg;
    if (state.strike) {
      soundEffects.src = `strike_${Math.round(Math.random() * 2)}.mp3`;
      soundEffects.play();
    } else if (state.bounce) {
      soundEffects.src = `bounce_${Math.round(Math.random() * 3)}.mp3`;
      soundEffects.play();
    }

    if (state.foul) {
      soundEffects2.src = `whistle.mp3`;
      soundEffects2.play();
    } else if (state.point) {
      soundEffects2.src = `whistle.mp3`;
      soundEffects2.play();
    }
    const playersCount = state.players.length;
    const movingPlayersCount = state.players.reduce(
      (prev, cur) =>
        prev +
        (cur.moveDirection?.x !== 0 || cur.moveDirection?.y !== 0 ? 1 : 0),
      0
    );
    const squeaksVolumeTar =
      playersCount === 0 ? 0 : movingPlayersCount / playersCount;
    squeaksVolume = squeaksVolume + 0.1 * (squeaksVolumeTar - squeaksVolume);
    squeaks.volume = squeaksVolume * state.sfxVolume;
    soundEffects.volume = state.sfxVolume;
    soundEffects2.volume = state.sfxVolume;
    soundTrack.volume = state.musicVolume;
  });

  const frame = () => {
    plot();
    requestAnimationFrame(frame);
  };
  frame();
})();

/* accepts parameters
 * h  Object = {h:x, s:y, v:z}
 * OR
 * h, s, v
 * https://stackoverflow.com/a/17243070/9288063
 */
function HSVtoRGB(h, s, v) {
  var r, g, b, i, f, p, q, t;
  if (arguments.length === 1) {
    (s = h.s), (v = h.v), (h = h.h);
  }
  i = Math.floor(h * 6);
  f = h * 6 - i;
  p = v * (1 - s);
  q = v * (1 - f * s);
  t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      (r = v), (g = t), (b = p);
      break;
    case 1:
      (r = q), (g = v), (b = p);
      break;
    case 2:
      (r = p), (g = v), (b = t);
      break;
    case 3:
      (r = p), (g = q), (b = v);
      break;
    case 4:
      (r = t), (g = p), (b = v);
      break;
    case 5:
      (r = v), (g = p), (b = q);
      break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}
