import { describe, expect, it } from "vitest";
import { dataBreve, linkSicuro } from "../lib/notizie";

describe("notizie", () => {
  it("scrive la data in italiano", () => {
    expect(dataBreve("2026-06-10")).toBe("10 giugno 2026");
    expect(dataBreve("boh")).toBe("boh");
  });
  it("apre solo link web", () => {
    expect(linkSicuro("https://www.molisenetwork.net/a?b=1")).toBe("https://www.molisenetwork.net/a?b=1");
    expect(linkSicuro("http://x.it/a")).toBe("http://x.it/a");
    expect(linkSicuro("javascript:alert(1)")).toBeNull();
    expect(linkSicuro("data:text/html,<script>")).toBeNull();
    expect(linkSicuro("non un url")).toBeNull();
  });
});
