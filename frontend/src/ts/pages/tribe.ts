import Page from "./page";
import * as Tribe from "../tribe/tribe";
import * as TribeState from "../tribe/tribe-state";
import * as TribeChat from "../tribe/tribe-chat";

export const page = new Page({
  name: "tribe",
  element: $(".page.pageTribe"),
  path: "/tribe",
  beforeHide: async () => {
    // TODO: Fill it up later
  },
  afterHide: async () => {
    // TODO: Fill it up later
    TribeChat.reset("lobby");
  },
  beforeShow: async () => {
    if (TribeState.getState() === 5) {
      TribeChat.fill("lobby");
      setTimeout(() => {
        TribeChat.scrollChat();
      }, 50);
    }
  },
  afterShow: async () => {
    if (TribeState.getState() < 1) {
      void Tribe.init();
    }
  },
});
