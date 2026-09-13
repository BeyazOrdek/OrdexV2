// ---------- ÖRDEX persisted UI/voice preferences (localStorage-backed) ----------

const KRISP_KEY = "ordex:krisp";
const HD_KEY = "ordex:hdboost";

/** Krisp-style processing (EC/NS/AGC) — on by default. */
export function krispEnabled(): boolean {
  try {
    return localStorage.getItem(KRISP_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setKrispPref(on: boolean) {
  try {
    localStorage.setItem(KRISP_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

/** MP4 HD Boost (sharpen/color enhance) — off by default. */
export function hdBoostEnabled(): boolean {
  try {
    return localStorage.getItem(HD_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHdBoostPref(on: boolean) {
  try {
    localStorage.setItem(HD_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}
