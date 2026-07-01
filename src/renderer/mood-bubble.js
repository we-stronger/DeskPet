(function attachMoodBubble(root) {
  const poolByAction = {
    tap: ["嗯？我在。", "找我吗？", "刚刚是不是戳我了？"],
    happy: ["今天也要加油。", "这样就很好。", "心情变好了。"],
    pout: ["不要一直戳啦。", "我有一点点不开心。", "哼，就一点点。"],
    sleep: ["我先睡一会儿。", "困困。", "晚安啦。"],
    wake: ["嗯……醒啦。", "还想再睡一会儿。", "好吧，我起来了。"],
    drag: ["要带我去哪？", "轻一点啦。", "我被拎起来了。"],
    feed: ["好吃。", "能量恢复了一点。", "谢谢你。"],
    pet: ["摸摸头可以。", "嗯，舒服。", "再摸一下也可以。"],
    gift: ["送给我的吗？", "我会好好收下的。", "今天有点开心。"],
    focus: ["我陪你专注一会儿。", "专心点哦。", "一起加油。"],
    greeting: ["早上好，今天也开始啦。", "记得吃饭。", "今天辛苦了。", "已经很晚了，要早点休息。"],
    streak: [],
    mouseNear: ["嗯？", "你在看我吗？", "有什么事吗？"],
  };

  const STREAK_MILESTONES = {
    3: "已经连续陪我 3 天啦。",
    7: "一周啦，辛苦你了。",
    14: "两周了，我一直都在。",
    30: "一个月了，谢谢你每天来看我。",
  };

  function pickRandom(pool) {
    if (!pool || pool.length === 0) {
      return "";
    }
    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }

  function bubbleTextForAction(action) {
    const pool = poolByAction[action];
    if (!pool) {
      return "";
    }
    return pickRandom(pool);
  }

  function streakTextForDays(days) {
    if (!Number.isFinite(days)) {
      return "";
    }
    const milestones = [3, 7, 14, 30];
    let matched = null;
    for (const m of milestones) {
      if (days >= m) {
        matched = m;
      }
    }
    return matched ? STREAK_MILESTONES[matched] : "";
  }

  function greetingTextForHour(hour) {
    const safe = Number.isFinite(hour) ? hour : new Date().getHours();
    if (safe >= 5 && safe < 11) {
      return "早上好，今天也开始啦。";
    }
    if (safe >= 11 && safe < 14) {
      return "记得吃饭。";
    }
    if (safe >= 14 && safe < 23) {
      return "今天辛苦了。";
    }
    return "已经很晚了，要早点休息。";
  }

  const api = {
    bubbleTextForAction,
    streakTextForDays,
    greetingTextForHour,
    STREAK_MILESTONES,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.DeskpetMoodBubble = api;
})(typeof window !== "undefined" ? window : globalThis);
