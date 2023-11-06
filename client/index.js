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

const controlsPlay = document.getElementById("controls-play");
const controlsServe = document.getElementById("controls-serve");
const controlsLob = document.getElementById("controls-lob");
const serveButton = document.getElementById("serve");
const joystickBg = document.getElementById("joystick").children[0];
const joystick = document.getElementById("joystick").children[1];
const joystickAimBg = document.getElementById("joystick-aim").children[0];
const joystickAim = document.getElementById("joystick-aim").children[1];
const lobButton = document.getElementById("lob");
const sendMsg = async (url, msg) => {
  const reply = await fetch(`${urlServer}/${url}`, {
    method: "POST",
    body: JSON.stringify(msg),
    headers: { "Content-Type": "application/json" },
  }).then((r) => r.json());
  return reply;
};

const activateMode = (mode) => {
  if (mode === "serve") {
    controlsPlay.style.display = "none";
    controlsServe.style.display = "block";
  } else {
    controlsServe.style.display = "none";
    controlsPlay.style.display = "block";
  }
};

let state = undefined;
let clientState = (async () => {
  await waitConnected();
  console.log("Connected");
  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    state = msg;

    const playerInfo = state.players.find(
      (player) => player.id === clientState?.id
    );
    if (playerInfo) {
      clientState.position = playerInfo.position;
      clientState.side = playerInfo.side;
      selectorTeam1.checked = playerInfo.team === 1;
      selectorTeam2.checked = playerInfo.team === 2;
    }
    if (
      state.serving?.player?.id !== undefined &&
      state.serving.player.id === clientState.id
    ) {
      activateMode("serve");
    } else {
      activateMode("normal");
    }

    document.getElementById("team1-label").innerHTML = state.team1Name;
    document.getElementById("team2-label").innerHTML = state.team2Name;
    controlsLob.style.display = state.lobAllowed ? "block" : "none";
  });

  const prevSession = JSON.parse(localStorage.getItem("tennis") || "{}") || {};
  clientState = await sendMsg("connect-client", prevSession);
  localStorage.setItem("tennis", JSON.stringify(clientState));
  clientState.moveDirection = { x: 0, y: 0 };

  let name = localStorage.getItem("name");
  if (!name) {
    name = prompt("What is your name?");
    localStorage.setItem("name", name);
  }
  clientState.name = name;
  sendMsg("push-client-update", clientState);

  // Prevent kicking out from inactivity
  setInterval(() => {
    sendMsg("push-client-update", clientState);
  }, 2000);

  const settingsButton = document.getElementById("settings");
  let settingsVisible = false;
  settingsButton.onclick = () => {
    settingsVisible = !settingsVisible;
    document.getElementById("settings-overlay").style.display = settingsVisible
      ? "block"
      : "none";
  };
  const selectorTeam1 = document.getElementById("team1");
  const selectorTeam2 = document.getElementById("team2");
  selectorTeam1.onchange = () => {
    clientState.team = 1;
    sendMsg("push-client-update", clientState);
  };
  selectorTeam2.onchange = () => {
    clientState.team = 2;
    sendMsg("push-client-update", clientState);
  };
  const inputName = document.getElementById("setting-name");
  inputName.value = clientState.name;
  inputName.onchange = () => {
    clientState.name = inputName.value;
    localStorage.setItem("name", inputName.value);
    sendMsg("push-client-update", clientState);
  };
  const inputLeave = document.getElementById("setting-leave");
  inputLeave.onclick = () => {
    sendMsg("push-client-update", { ...clientState, leave: true });
  };

  let crt;
  const handleDragStart = function (e) {
    crt = this.cloneNode(true);
    crt.style.opacity = 0;
    document.body.appendChild(crt);
    e.dataTransfer.setDragImage(crt, 0, 0);
  };

  const enableLob = () => {
    lobButton.style.color = "red";
    clientState.lob = true;
    clientState.aim = {
      x: -0.7 * clientState.position.x,
      y: -0.6 * Math.sign(clientState.position.y),
    };
    clientState.preparing = true;
    sendMsg("push-client-update", clientState);
  };
  const disableLob = () => {
    lobButton.style.color = "white";
    clientState.lob = false;
    clientState.aim = undefined;
    clientState.preparing = false;
    sendMsg("push-client-update", clientState);
  };
  lobButton.addEventListener("mousedown", (e) => {
    enableLob();
    e.preventDefault();
    e.stopPropagation();
  });
  lobButton.addEventListener("mouseup", (e) => {
    disableLob();
    e.preventDefault();
    e.stopPropagation();
  });
  lobButton.addEventListener("touchstart", (e) => {
    enableLob();
    e.preventDefault();
    e.stopPropagation();
  });
  lobButton.addEventListener("touchend", (e) => {
    disableLob();
    e.preventDefault();
    e.stopPropagation();
  });

  joystick.addEventListener("dragstart", handleDragStart, false);
  const handleJoystickMove = (locX, locY) => {
    if (locX === 0 && locY === 0) {
      return;
    }
    const bounds = joystickBg.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const deltaX = locX - centerX;
    const deltaY = locY - centerY;
    let joystickPosition = {
      x: Math.min(Math.abs(deltaX) / 45, 1) * Math.sign(deltaX),
      y: Math.min(Math.abs(deltaY) / 45, 1) * Math.sign(deltaY),
    };
    const len = Math.sqrt(joystickPosition.x ** 2 + joystickPosition.y ** 2);
    if (len > 1)
      joystickPosition = {
        x:
          joystickPosition.x /
          Math.sqrt(joystickPosition.x ** 2 + joystickPosition.y ** 2),
        y:
          joystickPosition.y /
          Math.sqrt(joystickPosition.x ** 2 + joystickPosition.y ** 2),
      };
    joystick.style.left = `${20 + joystickPosition.x * 45}px`;
    joystick.style.top = `${20 + joystickPosition.y * 45}px`;
    clientState.moveDirection = {
      x: joystickPosition.x,
      y: joystickPosition.y,
    };
    sendMsg("push-client-update", clientState);
  };
  const handleJoystickRelease = () => {
    joystick.style.left = `${20}px`;
    joystick.style.top = `${20}px`;
    clientState.moveDirection = { x: 0, y: 0 };
    sendMsg("push-client-update", clientState);
  };
  joystick.addEventListener("drag", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleJoystickMove(e.clientX, e.clientY);
  });
  joystick.addEventListener("dragend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (crt) crt.remove();
    handleJoystickRelease();
  });
  joystick.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  joystick.addEventListener("touchmove", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.targetTouches[0];
    if (!touch) {
      return;
    }
    handleJoystickMove(touch.clientX, touch.clientY);
  });
  joystick.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleJoystickRelease();
  });

  joystickAim.addEventListener("dragstart", handleDragStart, false);
  const handleAimJoystickMove = (locX, locY) => {
    if (locX === 0 && locY === 0) {
      return;
    }
    const bounds = joystickAimBg.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const deltaX = locX - centerX;
    const deltaY = locY - centerY;
    const joystickPosition = {
      x: Math.min(Math.abs(deltaX) / 45, 1) * Math.sign(deltaX),
      y: Math.min(Math.abs(deltaY) / 45, 1) * Math.sign(deltaY),
    };
    joystickAim.style.left = `${20 + joystickPosition.x * 45}px`;
    joystickAim.style.top = `${20 + joystickPosition.y * 45}px`;
    clientState.preparing = true;
    // more fail safe aiming (automatic margins)
    clientState.aim =
      clientState.side === 1
        ? {
            x: 0.9 * joystickPosition.x,
            y: 0.3 + 0.5 * (0.5 + joystickPosition.y / 2),
          }
        : {
            x: 0.9 * joystickPosition.x,
            y: -0.3 - 0.5 * (0.5 - joystickPosition.y / 2),
          };
    // more direct mapping to court
    // clientState.aim =
    //   clientState.side === 1
    //     ? {
    //         x: 1 * joystickPosition.x,
    //         y: 0 + 1 * (0.5 + joystickPosition.y / 2),
    //       }
    //     : {
    //         x: 1 * joystickPosition.x,
    //         y: 0 - 1 * (0.5 - joystickPosition.y / 2),
    //       };
    sendMsg("push-client-update", clientState);
  };
  const handleAimJoystickRelease = () => {
    joystickAim.style.left = `${20}px`;
    joystickAim.style.top = `${20}px`;
    clientState.preparing = false;
    clientState.aim = undefined;
    sendMsg("push-client-update", clientState);
  };
  joystickAim.addEventListener("drag", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleAimJoystickMove(e.clientX, e.clientY);
  });
  joystickAim.addEventListener("dragend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (crt) crt.remove();
    handleAimJoystickRelease();
  });
  joystickAim.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  joystickAim.addEventListener("touchmove", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = e.targetTouches[0];
    if (!touch) {
      return;
    }
    handleAimJoystickMove(touch.clientX, touch.clientY);
  });
  joystickAim.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleAimJoystickRelease();
  });

  serveButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clientState.aim = {
      x: -0.3 * Math.sign(clientState.position.x),
      y: -0.3 * Math.sign(clientState.position.y),
    };
    clientState.serve = true;
    console.log("serve", clientState.aim);
    sendMsg("push-client-update", clientState);
    setTimeout(() => {
      clientState.serve = false;
      clientState.aim = undefined;
      sendMsg("push-client-update", clientState);
    }, 500);
  });
})();
