import * as Notifications from "../elements/notifications";
import Config, * as UpdateConfig from "../config";
import * as DB from "../db";
import * as TribePages from "./tribe-pages";
import * as TribePagePreloader from "./pages/tribe-page-preloader";
import * as TribePageMenu from "./pages/tribe-page-menu";
import * as TribePageLobby from "./pages/tribe-page-lobby";
import * as TribeSound from "./tribe-sound";
import * as TribeChat from "./tribe-chat";
import * as TribeConfig from "./tribe-config";
import * as TribeCountdown from "./tribe-countdown";
import * as TimerEvent from "../observables/timer-event";
import * as TribeBars from "./tribe-bars";
import * as TribeResults from "./tribe-results";
import * as TribeUserList from "./tribe-user-list";
import * as TribeButtons from "./tribe-buttons";
import * as TribeStartRacePopup from "../popups/tribe-start-race-popup";
import * as TribeChartController from "./tribe-chart-controller";
import * as TribeDelta from "./tribe-delta";
import * as TestState from "../test/test-state";
import * as Random from "../utils/random";
import TribeSocket from "./tribe-socket";
import * as ActivePage from "../states/active-page";
import * as TribeState from "./tribe-state";
import { escapeRegExp, escapeHTML } from "../utils/misc";
import * as Time from "../states/time";
import * as TestWords from "../test/test-words";
import * as TestStats from "../test/test-stats";
import * as TestInput from "../test/test-input";
import * as TribeCarets from "./tribe-carets";
import * as TribeTypes from "./types";
import { navigate } from "../controllers/route-controller";
import { ColorName } from "../elements/theme-colors";

const defaultName = "Guest";
let name = "Guest";

export const expectedVersion = "0.13.5";

let autoJoin: string | undefined = undefined;

export function setAutoJoin(code: string): void {
  autoJoin = code;
}

export function getStateString(state: number): string {
  if (state === -1) return "error";
  if (state === 1) return "connected";
  if (state === 5) return "lobby";
  if (state === 10) return "preparing race";
  if (state === 11) return "race countdown";
  if (state === 12) return "race active";
  if (state === 20) return "at least one finished";
  if (state === 21) return "everyone finished";
  if (state === 22) return "everyone ready / timer over";
  return "Unknown state " + state;
}

function updateState(newState: number): void {
  const room = TribeState.getRoom();
  if (room) room.state = newState;
  TribeState.setState(newState);

  const state = TribeState.getState();

  $("#tribeStateDisplay").text(`${state} - ${getStateString(state)}`);

  if (state === 5) {
    TribePageLobby.enableNameVisibilityButtons();
    TribeBars.hide("tribe");
  } else if (state === 10) {
    TribeButtons.disableStartButton("lobby");
    TribeButtons.disableReadyButton("lobby");
    TribePageLobby.disableConfigButtons();
    TribePageLobby.disableNameVisibilityButtons();
    const self = TribeState.getSelf();
    if (self && (self.isReady || self.isLeader)) {
      Notifications.add("Race is starting...", 1, {
        customTitle: "Tribe",
      });
    }
  } else if (state === 11) {
    if (room?.users) {
      for (const user of Object.values(room.users)) {
        delete user.result;
        delete user.progress;
        delete user.isFinished;
        delete user.isTyping;
        if ((user.isReady || user.isLeader) && !user.isAfk) {
          user.isTyping = true;
          user.isFinished = false;
        }
      }
    }
    $("#tribeMiniChartCustomTooltip").remove();
    TribeUserList.update("lobby");
    TribeChartController.destroyAllCharts();
  } else if (state === 12) {
    if (room?.users) {
      for (const user of Object.values(room.users)) {
        if (user.isReady) {
          user.isReady = false;
        }
      }
    }
  } else if (state === 20) {
    if (TestState.isActive) {
      TribeCountdown.update("");
      TribeCountdown.show(true);
    } else {
      TribeResults.updateTimerText("Time left for everyone to finish");
    }
  } else if (state === 21) {
    TribeResults.hideTimer();
    TribeResults.updateTimerText("Time left for everyone to get ready");
    if (TribeState.getAutoReady()) {
      TribeSocket.out.room.readyUpdate();
    }
  } else if (state === 22) {
    TribePageLobby.enableNameVisibilityButtons();
    TribePageLobby.enableConfigButtons();
    TribeButtons.update();
  }
}

export async function init(): Promise<void> {
  TribePagePreloader.updateIcon("circle-notch", true);
  // TribePagePreloader.updateText("Waiting for login");
  // await AccountController.authPromise;
  TribePagePreloader.updateText("Connecting to Tribe");
  TribePagePreloader.updateSubtext("Please wait...");
  TribePagePreloader.hideReconnectButton();

  const snapName = DB.getSnapshot()?.name;
  if (snapName !== undefined) {
    name = snapName;
    TribeSocket.updateName(name);
  }

  //todo remove, only for dev
  const lstribename = window.localStorage.getItem("tribeName");
  if (lstribename !== undefined && lstribename !== null) {
    name = lstribename;
    TribeSocket.updateName(lstribename);
  }

  setTimeout(() => {
    TribeSocket.connect();
  }, 500);
}

async function reset(): Promise<void> {
  $("#result #tribeResultBottom").addClass("hidden");
  TribeUserList.reset();
  TribeResults.reset();
  TribeChat.reset();
  TribeBars.hide();
  TribePageLobby.reset();
  TribeBars.reset();
  TribeButtons.reset();
}

export function joinRoom(roomId: string, fromBrowser = false): void {
  if (!/^[a-f0-9]{6}$/i.test(roomId)) {
    Notifications.add("Incorrect room code format", 0);
    return;
  }

  void TribeSocket.out.room.join(roomId, fromBrowser).then((response) => {
    if (response.room) {
      TribeState.setRoom(response.room);
      updateState(response.room.state);
      TribePageLobby.init();
      void TribePages.change("lobby");
      TribeSound.play("join");
      TribeChat.updateSuggestionData();
      // history.replaceState(null, "", `/tribe/${roomId}`);
    } else {
      void TribePages.change("menu");
      history.replaceState("/tribe", "", "/tribe");
    }
  });
}

export function initRace(): void {
  let everyoneReady = true;
  const room = TribeState.getRoom();
  if (room?.users) {
    for (const user of Object.values(room.users)) {
      if (user.isLeader || user.isAfk) continue;
      if (!user.isReady) {
        everyoneReady = false;
      }
    }
  }
  if (everyoneReady) {
    TribeSocket.out.room.init();
  } else {
    TribeStartRacePopup.show();
  }
}

async function connect(): Promise<void> {
  const versionCheck = await TribeSocket.out.system.versionCheck(
    expectedVersion
  );

  if (versionCheck.status !== "ok") {
    TribeSocket.disconnect();
    TribePagePreloader.updateIcon("exclamation-triangle");
    TribePagePreloader.updateText(
      `Version mismatch.<br>Try refreshing or clearing cache.<br><br>Client version: ${expectedVersion}<br>Server version: ${versionCheck.version}`,
      true
    );
    TribePagePreloader.hideReconnectButton();
    TribePagePreloader.updateSubtext("");
    return;
  }

  UpdateConfig.setTimerStyle("mini", true);
  TribePageMenu.enableButtons();
  updateState(1);
  if (autoJoin !== undefined) {
    TribePagePreloader.updateText(`Joining room ${autoJoin}`);
    TribePagePreloader.updateSubtext("Please wait...");
    setTimeout(() => {
      joinRoom(autoJoin as string);
    }, 500);
  } else {
    void TribePages.change("menu");
  }
}

function checkIfEveryoneIsReady(): void {
  const room = TribeState.getRoom();
  if (!room) return;
  if (TribeState.getSelf()?.isLeader) {
    if (Object.keys(room.users).length <= 1) return;
    let everyoneReady = true;
    Object.keys(room.users).forEach((userId) => {
      if (
        room !== undefined &&
        (room.users[userId]?.isLeader || room.users[userId]?.isAfk)
      ) {
        return;
      }
      if (room !== undefined && !room.users[userId]?.isReady) {
        everyoneReady = false;
      }
    });
    if (everyoneReady) {
      Notifications.add("Everyone is ready", 1, {
        customTitle: "Tribe",
      });
      TribeSound.play("chat_mention");
    }
  }
}

TribeSocket.in.system.connect(() => {
  void connect();
});

$(".tribechangename").on("click", () => {
  const name = prompt("Name");
  if (name !== "" && name !== null) {
    window.localStorage.setItem("tribeName", name); //todo remove, only for dev
    TribeSocket.out.user.setName(name, true);
  }
});

TribeSocket.in.user.updateName((e) => {
  name = e.name;
});

TribeSocket.in.system.disconnect((reason, details) => {
  updateState(-1);
  const roomId = TribeState.getRoom()?.id;
  if (!$(".pageTribe").hasClass("active")) {
    Notifications.add(
      //@ts-ignore
      `Disconnected: ${details?.["description"]} (${reason})`,
      -1,
      {
        customTitle: "Tribe",
      }
    );
  }
  TribeState.setRoom(undefined);
  void TribePages.change("preloader");
  TribePagePreloader.updateIcon("times");
  TribePagePreloader.updateText(`Disconnected`);
  //@ts-ignore
  TribePagePreloader.updateSubtext(`${details?.["description"]} (${reason})`);
  TribePagePreloader.showReconnectButton();

  void reset();
  if (roomId !== undefined) {
    autoJoin = roomId;
  }
});

TribeSocket.in.system.connectFailed((err) => {
  updateState(-1);
  console.error(err);
  if (!$(".pageTribe").hasClass("active")) {
    Notifications.add("Connection failed", -1, {
      customTitle: "Tribe",
    });
  }
  void TribePages.change("preloader");
  TribePagePreloader.updateIcon("times");
  TribePagePreloader.updateText("Connection failed");
  TribePagePreloader.updateSubtext(err.message);
  TribePagePreloader.showReconnectButton();
  void reset();
});

TribeSocket.in.system.connectError((err) => {
  updateState(-1);
  console.error(err);
  if (!$(".pageTribe").hasClass("active")) {
    Notifications.add("Connection error", -1, {
      customTitle: "Tribe",
    });
  }
  void TribePages.change("preloader");
  TribePagePreloader.updateIcon("times");
  TribePagePreloader.updateText(`Connection error`);
  TribePagePreloader.updateSubtext(err.message);
  TribePagePreloader.showReconnectButton();
  void reset();
});

TribeSocket.in.system.reconnect((attempt) => {
  Notifications.add(`Reconnecting successful. (${attempt})`, 1, {
    customTitle: "Tribe",
  });
});

TribeSocket.in.system.reconnectAttempt((attempt) => {
  Notifications.add(`Reconnecting... (${attempt})`, 0, {
    customTitle: "Tribe",
  });
});

TribeSocket.in.system.notification((data) => {
  Notifications.add(data.message, data.level ?? 0, {
    customTitle: "Tribe",
  });
});

TribeSocket.in.room.joined((data) => {
  TribeState.setRoom(data.room);
  updateState(data.room.state);
  TribePageLobby.init();
  void TribePages.change("lobby");
  TribeSound.play("join");
  TribeChat.updateSuggestionData();
  // history.replaceState(null, "", `/tribe/${e.room.id}`);
});

TribeSocket.in.room.playerJoined((data) => {
  const room = TribeState.getRoom();
  if (room?.users) {
    room.users[data.user.id] = data.user;
    room.size = Object.keys(room.users).length;
    TribeUserList.update();
    TribeSound.play("join");
    TribeChat.updateSuggestionData();
    // TribeButtons.update("lobby")
  }
});

TribeSocket.in.room.playerLeft((data) => {
  const room = TribeState.getRoom();
  if (room?.users) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete room.users[data.userId];
    room.size = Object.keys(room.users).length;
    TribeUserList.update();
    TribeSound.play("leave");
    TribeButtons.update();
    TribeBars.fadeUser(undefined, data.userId);
    TribeCarets.destroy(data.userId);
    TribeResults.fadeUser("result", data.userId);
    TribeResults.update("result", data.userId);
    checkIfEveryoneIsReady();
    TribeChat.updateSuggestionData();
    TribeChat.updateIsTyping();
  }
});

TribeSocket.in.room.left(() => {
  TribeState.setRoom(undefined);
  updateState(1);
  TribePageMenu.enableButtons();
  if (!$(".pageTribe").hasClass("active")) {
    navigate("/tribe");
  }
  TribeCarets.destroyAll();
  TribeSound.play("leave");
  void TribePages.change("menu").then(() => {
    void reset();
  });
  TribeChat.updateIsTyping();
  name = defaultName;
});

TribeSocket.in.room.visibilityChanged((data) => {
  const room = TribeState.getRoom();
  if (!room) return;
  room.isPrivate = data.isPrivate;
  TribePageLobby.updateVisibility();
});

TribeSocket.in.room.nameChanged((data) => {
  const room = TribeState.getRoom();
  if (!room) return;
  room.name = data.name;
  TribePageLobby.updateRoomName();
});

TribeSocket.in.room.userIsReady((data) => {
  const room = TribeState.getRoom();
  if (!room) return;
  (room.users[data.userId] as TribeTypes.User).isReady = true;
  TribeUserList.update();
  TribeButtons.update();
  checkIfEveryoneIsReady();
});

TribeSocket.in.room.userAfkUpdate((data) => {
  const room = TribeState.getRoom();
  if (!room) return;
  const user = room.users[data.userId];
  if (!user) return;
  user.isAfk = data.isAfk;
  TribeUserList.update();
  TribeButtons.update();
});

TribeSocket.in.room.leaderChanged((data) => {
  const room = TribeState.getRoom();
  if (!room) return;
  const user = room.users[data.userId];
  if (!user) return;
  for (const userId of Object.keys(room.users)) {
    delete room.users[userId]?.isLeader;
  }

  user.isLeader = true;
  user.isAfk = false;
  user.isReady = false;
  TribeUserList.update();
  TribeButtons.update();
  TribePageLobby.updateVisibility();
  TribePageLobby.updateRoomName();
});

TribeSocket.in.room.chattingChanged((data) => {
  const room = TribeState.getRoom();
  if (!room) return;
  const user = room.users[data.userId];
  if (!user) return;
  user.isChatting = data.isChatting;
  TribeChat.updateIsTyping();
});

TribeSocket.in.room.chatMessage((data) => {
  data.message = data.message.trim();
  const regexString = `&#64;${escapeRegExp(escapeHTML(name))}${
    data.from?.isLeader ? "|ready|&#64;everyone" : ""
  }`;
  const nameregex = new RegExp(regexString, "i");
  if (!data.isSystem && data.from?.id != TribeSocket.getId()) {
    if (nameregex.test(data.message)) {
      if (ActivePage.get() !== "tribe" && ActivePage.get() !== "test") {
        Notifications.add(data.message, 0, {
          //allowing html because the message is already escaped on the server
          duration: 3,
          customTitle: "Mention",
          customIcon: "at",
          allowHTML: true,
        });
      }
      TribeSound.play("chat_mention");
      data.message = data.message.replace(
        nameregex,
        "<span class='mention'>$&</span>"
      );
    } else {
      TribeSound.play("chat");
    }
  }

  TribeChat.appendMessage(data.isSystem, data.from?.id, data.message);
});

// socket.on("room_config_changed", (e) => {
TribeSocket.in.room.configChanged((data) => {
  const room = TribeState.getRoom();
  if (!room) return;
  room.config = data.config;
  // for (const user of Object.values(room.users)) {
  //   if (user.isReady) {
  //     user.isReady = false;
  //   }
  // }
  TribeConfig.apply(data.config);
  TribePageLobby.updateRoomConfig();
  TribeButtons.update();
  TribeConfig.setLoadingIndicator(false);
  TribeUserList.update();
});

// socket.on("room_init_race", (e) => {
TribeSocket.in.room.initRace((data) => {
  const room = TribeState.getRoom();
  updateState(11);
  if (TribeState.getSelf()?.isTyping) {
    TribeResults.init("result");
    TribeBars.init("test");
    TribeBars.show("test");
  } else {
    //TODO update lobby bars
    if (ActivePage.get() !== "tribe") {
      navigate("/tribe", {
        tribeOverride: true,
      });
    }
    TribeBars.init("tribe");
    TribeBars.show("tribe");
    return;
  }
  if (room) room.seed = data.seed;
  Random.setSeed(TribeState.getRoom()?.seed.toString() ?? "");
  navigate("/", {
    tribeOverride: true,
    force: true,
  });
  TribeDelta.reset();
  TribeDelta.showBar();
  TribeCountdown.show2();
  TribeSound.play("start");
  TribeCarets.init();
});

TribeSocket.in.room.stateChanged((data) => {
  updateState(data.state);
});

TribeSocket.in.room.countdown((data) => {
  TribeCountdown.update2(data.time.toString());
  if (data.time <= 3) TribeSound.play("cd");
});

TribeSocket.in.room.usersUpdate((data) => {
  const room = TribeState.getRoom();
  if (!room) return;

  let isChattingChanged = false;
  for (const [userId, user] of Object.entries(data)) {
    const roomUser = room.users[userId] as TribeTypes.User;
    if (user.isTyping !== undefined) {
      roomUser.isTyping = user.isTyping;
    }
    if (user.isAfk !== undefined) roomUser.isAfk = user.isAfk;
    if (user.isReady !== undefined) roomUser.isReady = user.isReady;
    if (user.isChatting !== undefined) {
      isChattingChanged = true;
      roomUser.isChatting = user.isChatting;
    }
  }
  TribeUserList.update("lobby");
  TribeUserList.update("result");
  TribeButtons.update("lobby");
  if (isChattingChanged) {
    TribeChat.updateIsTyping();
  }
});

TribeSocket.in.room.raceStarted(() => {
  updateState(12);
  if (!TribeState.getSelf()?.isTyping) return;
  TribeSound.play("cd_go");
  TribeCountdown.hide2();
  setTimeout(() => {
    if (!TestState.isActive) {
      TimerEvent.dispatch("start");
    }
  }, 500);
});

// socket.on("room_progress_update", (e) => {
TribeSocket.in.room.progressUpdate((data) => {
  const room = TribeState.getRoom();
  if (!room) return;
  room.maxWpm = data.roomMaxWpm;
  room.maxRaw = data.roomMaxRaw;
  room.minWpm = data.roomMinWpm;
  room.minRaw = data.roomMinRaw;

  if (
    TribeState.getState() >= 10 &&
    TribeState.getState() <= 21 &&
    TestState.isActive
  ) {
    const wpmAndRaw = TestStats.calculateWpmAndRaw();
    const acc = Math.floor(TestStats.calculateAccuracy());
    let progress = 0;
    const inputLen = TestInput.input.current.length;
    if (Config.mode === "time") {
      progress = 100 - ((Time.get() + 1) / Config.time) * 100;
    } else {
      const currentWordLen = TestWords.words.getCurrent().length;
      const localWordProgress = Math.round((inputLen / currentWordLen) * 100);

      const globalWordProgress = Math.round(
        localWordProgress * (1 / TestWords.words.length)
      );

      let outof = TestWords.words.length;
      if (Config.mode === "words") {
        outof = Config.words;
      }

      const wordsProgress = Math.floor(
        (TestState.activeWordIndex / outof) * 100
      );

      progress = wordsProgress + globalWordProgress;
    }

    if (room.config.isInfiniteTest) {
      progress = 0;
    }

    TribeSocket.out.room.progressUpdate({
      wpm: wpmAndRaw.wpm,
      raw: wpmAndRaw.raw,
      acc,
      progress,
      wordIndex: TestState.activeWordIndex,
      letterIndex: inputLen - 1,
      afk: TestInput.afkHistory[TestInput.afkHistory.length - 1] ?? false,
    });
  }

  TribeCarets.updateAndAnimate(data.users);

  for (const [userId, userProgress] of Object.entries(data.users)) {
    if (room.users[userId] === undefined) continue;
    room.users[userId].progress = userProgress;
    if (userId == TribeSocket.getId()) {
      TribeDelta.update();
    }
    //todo only update one
    if (room.users[userId].isFinished === false) {
      TribeBars.update("test", userId);
      TribeBars.update("tribe", userId);
      TribeResults.updateBar("result", userId);
      TribeResults.updateWpmAndAcc(
        "result",
        userId,
        userProgress.wpm,
        userProgress.acc
      );
    }
  }
});

// socket.on("room_user_result", (e) => {
TribeSocket.in.room.userResult((data) => {
  const room = TribeState.getRoom();
  if (!room) return;
  const user = room.users[data.userId];
  if (!user) return;
  user.result = data.result;
  user.isFinished = true;
  user.isTyping = false;
  const resolve = data.result?.resolve;
  if (
    resolve === undefined ||
    resolve?.afk ||
    resolve?.repeated ||
    resolve?.valid === false ||
    resolve?.saved === false ||
    resolve?.failed === true
  ) {
    //todo only one

    let color = undefined;
    if (resolve?.failed === true) {
      color = "colorfulError" as ColorName;
    }

    if (color) TribeCarets.changeColor(data.userId, color);
    TribeBars.fadeUser("test", data.userId, color);
    TribeBars.fadeUser("tribe", data.userId, color);
    if (!room.config.isInfiniteTest) {
      TribeResults.fadeUser("result", data.userId);
    }
    if (resolve?.afk) {
      TribeCarets.destroy(data.userId);
    }
  } else {
    TribeCarets.destroy(data.userId);
    if (room.config.mode !== "time") {
      TribeBars.completeBar("test", data.userId);
      TribeBars.completeBar("tribe", data.userId);
      TribeResults.updateBar("result", data.userId, 100);
    }
  }
  if (!TestState.isActive) {
    TribeCarets.destroyAll();
    TribeResults.update("result", data.userId);
    TribeUserList.update("result");
    setTimeout(async () => {
      if (data.everybodyCompleted) {
        await TribeChartController.drawAllCharts();
      } else {
        await TribeChartController.drawChart(data.userId);
      }
      if (TribeState.getState() >= 21) {
        void TribeChartController.updateChartMaxValues();
      }
    }, 250);
  }
});

TribeSocket.in.room.finishTimerCountdown((data) => {
  if (TestState.isActive) {
    TribeCountdown.update(data.time.toString());
  } else {
    TribeResults.updateTimer(data.time.toString());
  }
});

TribeSocket.in.room.finishTimerOver(() => {
  TribeCountdown.hide();
  TribeResults.hideTimer();
  if (TestState.isActive) {
    TimerEvent.dispatch("fail", "out of time");
  }
});

TribeSocket.in.room.destroyTest((data) => {
  if (TestState.isActive) {
    if (data.reason === "afk") {
      TimerEvent.dispatch("fail", "afk");
    }
  }
});

TribeSocket.in.room.readyTimerCountdown((data) => {
  if (TestState.isActive) {
    TribeCountdown.update(data.time.toString());
  } else {
    TribeResults.updateTimer(data.time.toString());
  }
});

TribeSocket.in.room.readyTimerOver(() => {
  TribeCountdown.hide();
  TribeResults.hideTimer();
  if (TestState.isActive) {
    TimerEvent.dispatch("fail", "out of time");
  }
});

TribeSocket.in.room.backToLobby(() => {
  navigate("/tribe");
});

TribeSocket.in.room.finalPositions((data) => {
  const room = TribeState.getRoom();
  if (!room) return;
  TribeResults.updatePositions("result", data.positions, true);
  TribeResults.updateMiniCrowns("result", data.miniCrowns);
  for (const userArray of Object.values(data.positions)) {
    for (const user of userArray) {
      const u = room.users[user.id] as TribeTypes.User;
      u.points = user.newPointsTotal;
    }
  }
  TribeUserList.update();

  let localGlow = false;

  const positions = data.positions["1"];

  if (!positions) return;

  for (const winner of positions) {
    if (winner.id === TribeSocket.getId()) {
      localGlow = true;
    }

    let isGlowing = false;
    if (
      data.miniCrowns.wpm.includes(winner.id) &&
      data.miniCrowns.acc.includes(winner.id) &&
      data.miniCrowns.raw.includes(winner.id) &&
      data.miniCrowns.consistency.includes(winner.id)
    ) {
      isGlowing = true;
    }

    TribeResults.showCrown("result", winner.id, isGlowing);
  }

  if (positions.some((u) => u.id === TribeSocket.getId())) {
    TribeSound.play("finish_win");
    if (localGlow) {
      TribeSound.play("glow");
    }
  } else {
    TribeSound.play("finish");
  }
});

$(`.pageTribe .tribePage.lobby .lobbyButtons .startTestButton,
  .pageTest #tribeResultBottom .buttons .startTestButton`).on("click", (_e) => {
  initRace();
});

$(".pageTribe .tribePage.preloader .reconnectButton").on("click", () => {
  TribePagePreloader.hideReconnectButton();
  void init();
});

window.addEventListener("beforeunload", () => {
  if (TribeState.getState() > 0) {
    TribeSocket.disconnect();
  }
});
