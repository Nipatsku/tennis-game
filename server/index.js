const express = require("express");
const { WebSocket, WebSocketServer } = require("ws");
const app = express();
app.use(express.json());
const port = 3000;
const wss = new WebSocketServer({ port: 3010 });

const broadcast = (msg) => {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
};
const genUID = () => (Math.random() * 1_000_000).toFixed(0);
const clamp = (v, a, b) =>
  a > b ? clamp(v, b, a) : Math.max(Math.min(v, b), a);

let state = {
  score: [0, 0],
  serves: [],
  returns: [],
  players: [],
  playerSpeed: 0.5,
  sweetSpotSize: 0.5, // NOTE: meters
  ball: undefined,
  ballSpeed: 0.5,
  team1Name: "Team 1",
  team2Name: "Team 2",
  sfxVolume: 1,
  musicVolume: 1,
  displaySweetSpot: true,
  displayAim: true,
  lobAllowed: false,
};

const getNewPlayerTeam = () => {
  const team1PlayerCount = state.players.reduce(
    (prev, cur) => prev + (cur.team === 1 ? 1 : 0),
    0
  );
  const team2PlayerCount = state.players.reduce(
    (prev, cur) => prev + (cur.team === 2 ? 1 : 0),
    0
  );
  return team1PlayerCount > team2PlayerCount ? 2 : 1;
};
const getPlayerSide = (player) => {
  // Check side from existing players (match)
  const teamPlayer = state.players.find(
    (existing) => existing !== player && existing.team === player.team
  );
  return teamPlayer ? teamPlayer.side : player.team;
};
const applyPlayerDefaultPosition = (player) => {
  player.position =
    player.side === 1
      ? { x: Math.random() * 2 - 1, y: -1 }
      : { x: Math.random() * 2 - 1, y: 1 };
};

wss.on("connection", (e) => {});
app.use("/game", express.static("game"));
app.use("/play-tennis", express.static("client"));
app.post("/connect-client", (req, res) => {
  const prevSession = req.body;
  const match =
    prevSession && state.players.find((p) => p.id === prevSession.id);
  if (match) {
    console.log("existing player reconnected");
    res.send(match);
    console.log(state);
    return;
  }
  console.log("new player connected");
  const id = genUID();
  const team = getNewPlayerTeam();
  const player = {
    id,
    team,
    moveDirection: { x: 0, y: 0 },
    lob: false,
    lastClientUpdate: Date.now(),
  };
  player.side = getPlayerSide(player);
  applyPlayerDefaultPosition(player);
  state.players.push(player);
  res.send(player);
  broadCastStateUpdate();
});
app.post("/push-client-update", (req, res) => {
  const clientState = req.body;
  const player = state.players.find((p) => p.id === clientState.id);
  if (!player) {
    return;
  }
  player.lastClientUpdate = Date.now();
  if (clientState.leave) {
    console.log("player leave");
    state.players.splice(state.players.indexOf(player), 1);
    state.serving = undefined;
  }
  if (
    player.moveDirection.x === 0 &&
    player.moveDirection.y === 0 &&
    (clientState.moveDirection.x !== 0 || clientState.moveDirection.y !== 0)
  ) {
    player.movingStart = Date.now();
  }
  player.moveDirection = clientState.moveDirection;
  if (!player.preparing && clientState.preparing)
    player.preparingStart = Date.now();
  player.preparing = clientState.preparing;
  player.aim = clientState.aim;
  player.serve = clientState.serve;
  player.name = clientState.name;
  player.lob = clientState.lob;
  if (clientState.team !== player.team) {
    player.team = clientState.team;
    // Reposition player, team changed
    player.side = getPlayerSide(player);
    applyPlayerDefaultPosition(player);
  }
  res.send({});
  broadCastStateUpdate();
});
app.post("/sweet-spot", (req, res) => {
  const clientState = req.body;
  const player = state.players.find((p) => p.id === clientState.id);
  if (player) {
    player.sweetSpot = clientState.sweetSpot;
  }
  res.send({});
});
app.post("/settings", (req, res) => {
  const settings = req.body;
  state = { ...state, ...settings };
  console.log(settings);
  if (settings.botCount !== undefined) {
    const existingBots = state.players.filter((item) =>
      item.name.includes("Bot")
    );
    if (settings.botCount < existingBots.length) {
      const keptBots = existingBots.slice(0, settings.botCount);
      state.players = state.players.filter(
        (player) =>
          player.name === undefined ||
          !player.name.includes("Bot") ||
          keptBots.includes(player)
      );
    } else {
      for (let i = existingBots.length; i < settings.botCount; i += 1) {
        const id = genUID();
        const team = getNewPlayerTeam();
        const bot = {
          position: { x: Math.random(), y: 0 },
          team,
          name: `Bot`,
          id,
          moveDirection: { x: 0, y: 0 },
          preparing: false,
          lob: false,
        };
        bot.side = getPlayerSide(bot);
        state.players.push(bot);
      }
    }
  }
  broadCastStateUpdate();
  res.send({});
});
app.post("/reset", (req, res) => {
  reset();
  broadCastStateUpdate();
  res.send({});
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

const broadCastStateUpdate = () => {
  broadcast(JSON.stringify(state));
};
setInterval(() => {
  broadCastStateUpdate();
}, 1000);
const endRally = (ballState, isWin, reason) => {
  if (state.ball.over) return;
  state.ball.over = true;
  if (!isWin) {
    state.foul = reason ? reason : true;
    state.score[state.ball.hitter.team === 1 ? 1 : 0] += 1;
  }
  if (isWin) {
    state.point = true;
    state.score[state.ball.hitter.team - 1] += 1;
  }
  console.log(isWin ? `good shot ${reason}` : `bad shot ${reason}`);
  // check win condition
  if (state.score[0] >= 15 || state.score[1] >= 15) {
    // game over
    state.victory = { team: state.score[0] >= 15 ? 1 : 2 };
    setTimeout(() => {
      reset();
    }, 15_000);
  }
  broadCastStateUpdate();
  setTimeout(() => {
    state.ball = undefined;
    broadCastStateUpdate();
  }, 2500);
};
const reset = () => {
  state.victory = undefined;
  state.score = [0, 0];
  state.serves = [];
  state.returns = [];
  state.ball = undefined;
  state.serving = undefined;
  state.changeSides = false;
  broadCastStateUpdate();
};
const hitBall = (player, tar, errMetersHorizontal, errMetersVertical) => {
  state.ball = state.ball || {
    position: { x: player.position.x, y: player.position.y, z: 0.8 },
    velocity: { x: 0, y: 0 },
  };
  state.ball.hitter = player;
  state.ball.contacts = 0;
  player.preparing = false;
  player.hitting = true;
  player.hittingStart = Date.now();
  state.strike = true;
  setTimeout(() => {
    player.hitting = false;
    broadCastStateUpdate();
  }, 750);

  const rad = (deg) => (deg * Math.PI) / 180;
  const distXY = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  // state.ball.velocity.x = 0;
  // state.ball.velocity.y = 1 * -Math.sign(player.position.y);
  // state.ball.velocity.z = 3;

  // CONSTANTS
  //  - ball start location   xyz
  //  - ball end location     xyz
  //  - net height            number
  //  - ball speed            number
  //  - ball height at net    number
  //
  // NOTES
  //  - perform all calculations in meters, and translate end results to game coordinate system
  const startPositionMeters = {
    x: (state.ball.position.x * 10.97) / 2,
    y: (state.ball.position.y * 23.7) / 2,
    z: state.ball.position.z * 0.91,
  };
  const targetPositionMeters = {
    x: (tar.x * 10.97) / 2,
    y: (tar.y * 23.7) / 2,
  };

  const netHeightMeters = 0.91;
  const gravity = 9.8;
  const targetBallHeightAtNet = netHeightMeters + 1;

  // Simulate different ball paths with brute force :(
  const deltaXY = {
    x: targetPositionMeters.x - startPositionMeters.x,
    y: targetPositionMeters.y - startPositionMeters.y,
  };
  const unitXY = {
    x: deltaXY.x / Math.sqrt(deltaXY.x ** 2 + deltaXY.y ** 2),
    y: deltaXY.y / Math.sqrt(deltaXY.x ** 2 + deltaXY.y ** 2),
  };

  const tStep = 1 / 60;
  const gravityStep = gravity * tStep;
  let angleOptions = [];
  if (!player.lob) {
    angleOptions.push(-10, 0);
    for (let angle = 10; angle <= 24; angle += 3) {
      angleOptions.push(rad(angle));
    }
  } else {
    angleOptions.push(45, 50, 55, 60, 65, 70);
  }
  const velocityOptions = [10, 12, 14, 16];
  let best = undefined;
  // console.time("simulate");
  for (const angle of angleOptions) {
    for (const velocity of velocityOptions) {
      let simPosition = { ...startPositionMeters };
      let simVelocityZ = Math.sin(angle) * velocity;
      const velocityXY = Math.cos(angle) * velocity;
      const xyStep = {
        x: tStep * velocityXY * unitXY.x,
        y: tStep * velocityXY * unitXY.y,
      };
      let netClearance = undefined;
      let landPosition = undefined;
      let i = 0;
      let t = 0;
      do {
        t += tStep;
        if (Math.sign(simPosition.y) !== Math.sign(simPosition.y + xyStep.y)) {
          netClearance = simPosition.z;
        }
        simPosition.x += xyStep.x;
        simPosition.y += xyStep.y;
        simPosition.z += simVelocityZ * tStep;
        simVelocityZ -= gravityStep;
        if (simPosition.z <= 0) {
          landPosition = simPosition;
          break;
        }
        i += 1;
      } while (i < 10000);
      // const errorNet =
      //   netClearance !== undefined
      //     ? Math.abs(netClearance - targetBallHeightAtNet)
      //     : 100;
      let errorNet =
        netClearance !== undefined
          ? netClearance <= 1.5
            ? 1.5 - netClearance
            : netClearance > 1.5
            ? netClearance - 1.5
            : 0
          : 0;
      const errorLanding =
        landPosition !== undefined
          ? distXY(landPosition, targetPositionMeters)
          : 100;
      const errorTotal = errorNet + errorLanding;
      // const errorTotal = errorLanding;
      if (!best || errorTotal < best.errorTotal) {
        best = {
          // errorNet,
          errorLanding,
          errorTotal,
          netClearance,
          landPosition,
          angle,
          velocity,
        };
      }
    }
  }
  // console.timeEnd("simulate");
  // Translate from meters to game coordinate system
  const velocityMetersXY = Math.cos(best.angle) * best.velocity;
  const angleXZ = Math.atan(deltaXY.x / deltaXY.y);
  const velocityMetersX =
    Math.abs(Math.sin(angleXZ)) * velocityMetersXY * Math.sign(unitXY.x);
  const velocityMetersY =
    Math.abs(Math.cos(angleXZ)) * velocityMetersXY * Math.sign(unitXY.y);
  const velocityMetersZ = Math.sin(best.angle) * best.velocity;
  const velocity = {
    x: (velocityMetersX / 10.97) * 2,
    y: (velocityMetersY / 23.7) * 2,
    z: velocityMetersZ / 0.91,
  };
  state.ball.velocity = velocity;

  // console.log(
  //   "angle",
  //   ((best.angle * 180) / Math.PI).toFixed(0),
  //   "velocity",
  //   best.velocity.toFixed(1),
  //   "error",
  //   best.errorTotal.toFixed(1),
  //   "landing",
  //   best.landPosition,
  //   "...",
  //   deltaXY,
  //   targetPositionMeters,
  //   angleXZ,
  //   velocityMetersX
  // );
};

let tPrevUpdate = performance.now();
setInterval(() => {
  const tNow = performance.now();
  const tDelta = tNow - tPrevUpdate;
  let clientUpdateRequired = false;
  const playerSpeed = (tDelta * state.playerSpeed) / 1000;

  if (!state.ball && state.players.length >= 2 && !state.victory) {
    // Check if sides should change. Sides are changed every 7 points.
    if (
      state.serves.length % 7 === 0 &&
      state.serves.length > 0 &&
      !state.changeSides &&
      !state.sidesChangedAlready
    ) {
      state.changeSides = true;
      state.sidesChangedAlready = true;
      clientUpdateRequired = true;
      setTimeout(() => {
        state.players.forEach((player) => {
          player.side = player.side === 1 ? 2 : 1;
          player.position.y *= -1;
        });
        state.changeSides = false;
        broadCastStateUpdate();
      }, 5000);
    } else if (!state.serving && !state.changeSides) {
      // 1. Check team sides switched?
      // 2. Find team who is serving. 1st serve is team 1, then next two team 2, and vice versa
      const servingTeam = 1 + Math.floor(((state.serves.length + 1) / 2) % 2);
      // 3. Find player who is serving.
      const servingPlayer = state.players.reduce(
        (prev, cur) =>
          cur.team !== servingTeam
            ? prev
            : prev === undefined
            ? cur
            : state.serves.findIndex((serve) => serve.player === cur) < 0
            ? cur
            : state.serves.findIndex((serve) => serve.player === prev) < 0
            ? prev
            : state.serves.findIndex((serve) => serve.player === cur) >
              state.serves.findIndex((serve) => serve.player === prev)
            ? cur
            : prev,
        undefined
      );
      // 4. Find player who is returning.
      const returningPlayer = state.players.reduce(
        (prev, cur) =>
          cur.team === servingTeam
            ? prev
            : prev === undefined
            ? cur
            : state.returns.findIndex((serve) => serve.player === cur) < 0
            ? cur
            : state.returns.findIndex((serve) => serve.player === prev) < 0
            ? prev
            : state.returns.findIndex((serve) => serve.player === cur) >
              state.returns.findIndex((serve) => serve.player === prev)
            ? cur
            : prev,
        undefined
      );
      // 5. Position players to default locations
      if (servingPlayer && returningPlayer) {
        // Serve X side alternates between every serve
        const serveX = state.serves.length % 2 === 0 ? 0.6 : -0.6;
        const serveY = servingPlayer.side === 1 ? -1 : 1;
        servingPlayer.position = {
          x: serveX,
          y: serveY,
        };
        returningPlayer.position = { x: -serveX, y: -serveY };
        const serveTeamPlayers = state.players.filter(
          (player) => player.team === servingTeam && player !== servingPlayer
        );
        const returnTeamPlayers = state.players.filter(
          (player) => player.team !== servingTeam && player !== returningPlayer
        );
        serveTeamPlayers.forEach((player, i) => {
          player.position = {
            x: -serveX + i * Math.sign(serveX) * 0.2,
            y: serveY / 2,
          };
        });
        returnTeamPlayers.forEach((player, i) => {
          player.position = {
            x: serveX - i * Math.sign(serveX) * 0.2,
            y: -serveY / 2,
          };
        });
        state.serving = { team: servingTeam, player: servingPlayer };
        state.returns.unshift({ player: returningPlayer });
        clientUpdateRequired = true;
      }
    } else if (!state.changeSides) {
      // Check if server pressed serve button
      const servingPlayer = state.serving.player;
      if (servingPlayer.serve && servingPlayer.aim) {
        hitBall(servingPlayer, servingPlayer.aim, 0, 0);
        state.serving = undefined;
        state.serves.unshift({ player: servingPlayer });
        state.sidesChangedAlready = false;
        servingPlayer.serve = false;
        servingPlayer.aim = undefined;
        clientUpdateRequired = true;
      }
    }
  }

  // Auto kick inactive clients
  for (let i = 0; i < state.players.length; i += 1) {
    const player = state.players[i];
    if (Date.now() - player.lastClientUpdate >= 10_000) {
      console.log("kick inactive player", player);
      state.players.splice(i, 1);
      i -= 1;
      state.serving = undefined;
    }
  }

  for (const player of state.players) {
    if (player.name && player.name.includes("Bot")) {
      // Bot logic
      player.moveDirection = { x: 0, y: 0 };
      player.aim = undefined;
      player.serve = false;
      player.preparing = false;
      if (state.serving && state.serving.player === player) {
        // serve
        player.aim = {
          x: -0.3 * Math.sign(player.position.x),
          y: -0.3 * Math.sign(player.position.y),
        };
        player.serve = true;
      } else if (
        state.ball &&
        state.ball.hitter.team !== player.team &&
        state.ball.contacts < 2
      ) {
        // move towards ball and aim
        const delta = {
          x:
            state.ball.position.x -
            (player.side === 1 ? 0.13 : 0.16) -
            player.position.x,
          y:
            state.ball.position.y +
            0.1 * Math.sign(state.ball.position.y) -
            player.position.y,
        };
        player.moveDirection = {
          x: Math.sign(delta.x) * Math.min(Math.abs(delta.x * 10), 1),
          y:
            Math.sign(state.ball.position.y) === Math.sign(player.position.y) &&
            Math.abs(state.ball.position.y) > 0.25
              ? Math.sign(delta.y) * Math.min(Math.abs(delta.y * 1), 1)
              : (player.side === 1 ? -1.3 : 1.3) - player.position.y,
        };
        player.preparing = true;
        player.aim = {
          x: Math.sin(Date.now() / 1000) * 0.3,
          y:
            (Math.sin(Date.now() / 2000) * 0.1 + 0.5) *
            -Math.sign(player.position.y),
        };
      } else {
        // move towards center
        const delta = {
          x: 0 - player.position.x,
          y: (player.side === 1 ? -1.3 : 1.3) - player.position.y,
        };
        if (Math.sqrt(delta.x ** 2 + delta.y ** 2) > 0.5)
          player.moveDirection = delta;
      }
    }

    const moveDirection = player.moveDirection;
    if (
      (moveDirection?.x || moveDirection?.y) &&
      state.serving?.player !== player
    ) {
      const positionPrev = player.position;
      const positionNew = {
        x: clamp(positionPrev.x + moveDirection.x * playerSpeed, -1.5, 1.5),
        y: clamp(
          positionPrev.y + moveDirection.y * playerSpeed,
          player.side === 1 ? -1.5 : 0.03,
          player.side === 1 ? -0.03 : 1.5
        ),
      };
      player.position = positionNew;
      // check if hitting volley or stroke
      player.volley = Math.abs(player.position.y) < 0.5;
      clientUpdateRequired = true;
    }
    if (
      player.preparing &&
      state.ball &&
      state.ball.hitter.team !== player.team &&
      player.sweetSpot
    ) {
      const sweetSpot = player.sweetSpot;
      const ball = state.ball.position;
      const distXZMeters = Math.sqrt(
        ((ball.x - sweetSpot.x) ** 2 * 10.97) / 2 +
          ((ball.z - sweetSpot.z) ** 2 * 0.91) / 2
      );
      const distYMeters = (Math.abs(ball.y - sweetSpot.y) * 23.77) / 2;
      const errTotal = Math.sqrt(distXZMeters ** 2 + distYMeters ** 2);
      if (errTotal <= state.sweetSpotSize) {
        const tar = player.aim;
        const errMetersHorizontal = 0;
        const errMetersVertical = 0;
        hitBall(player, tar, errMetersHorizontal, errMetersVertical);
      }
    }
  }
  if (
    state.ball &&
    (state.ball.velocity.x !== 0 ||
      state.ball.velocity.y !== 0 ||
      state.ball.velocity.z !== 0)
  ) {
    const ballSpeed = (tDelta * state.ballSpeed) / 1000;
    const prevY = state.ball.position.y;
    state.ball.position.x += state.ball.velocity.x * ballSpeed;
    state.ball.position.y += state.ball.velocity.y * ballSpeed;
    state.ball.position.z += state.ball.velocity.z * ballSpeed;
    if (Math.abs(state.ball.position.y >= 1.6)) {
      endRally(state.ball, true);
    }
    if (state.ball.position.z <= 0) {
      // ball hit ground
      state.ball.position.z = 0;
      state.ball.velocity.z *= -0.5;
      state.ball.velocity.x *= 0.7;
      state.ball.velocity.y *= 0.7;
      state.ball.contacts += 1;
      state.lastContact = { ...state.ball.position };
      if (state.ball.contacts <= 2) {
        state.bounce = true;
      }
      if (state.ball.contacts >= 2) {
        endRally(state.ball, true);
      } else {
        // check valid shot or not
        // TODO: Serve rules
        const marginX = (0.2 / 10.97) * 2; // 0.2m = 20 cm
        const marginY = (0.2 / 23.7) * 2; // 0.2m = 20 cm
        const bounds =
          state.ball.hitter.side === 1
            ? {
                xMin: -1 - marginX,
                xMax: 1 + marginX,
                yMin: 0,
                yMax: 1 + marginY,
              }
            : {
                xMin: -1 - marginX,
                xMax: 1 + marginX,
                yMin: -1 - marginY,
                yMax: 0,
              };
        const legal =
          state.ball.position.x >= bounds.xMin &&
          state.ball.position.x <= bounds.xMax &&
          state.ball.position.y >= bounds.yMin &&
          state.ball.position.y <= bounds.yMax;
        if (!legal) {
          endRally(state.ball, false, "Outside bounds!");
        }
      }
    } else {
      // gravity
      state.ball.velocity.z -= 0.91 * 9.8 * ballSpeed;
      // check hit net
      if (
        Math.sign(state.ball.position.y) !== Math.sign(prevY) &&
        state.ball.position.z <= 1 &&
        !state.ball.hitNet
      ) {
        state.bounce = true;
        state.ball.hitNet = true;
        state.ball.position.y = 0;
        state.ball.velocity.x = Math.random() * 2 - 1;
        state.ball.velocity.y *= -Math.random();
        state.ball.velocity.z = 2 * (Math.random() * 2 - 1);
        endRally(state.ball, false, "Net shot!");
      }
    }

    clientUpdateRequired = true;
  }

  if (clientUpdateRequired) {
    broadCastStateUpdate();
  }
  state.strike = false;
  state.bounce = false;
  state.foul = false;
  state.point = false;
  tPrevUpdate = tNow;
}, 1000 / 60);
