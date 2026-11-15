import test from "node:test";
import assert from "node:assert/strict";
import { getStore } from "../src/lib/store.ts";
import { balanceOf, joinedCreditCount, savePointsConfig } from "../src/lib/rewards.ts";
import { generalReferralLink, parseGeneralReferral, recentReferrals, registerGeneralReferral } from "../src/lib/referrals.ts";

process.env.VERCEL = "1"; // keep this test's in-memory store out of the repository filesystem

test("general referral validates links, writes the referral, credits once, and refuses duplicate credit", async () => {
  const store = getStore();
  assert.equal(store.backend, "memory");
  await store.set("user:1001", { id: "1001", firstName: "Inviter", username: "inviter", joinedAt: 1 });
  await savePointsConfig({ enabled: true, perJoin: 5 });

  assert.equal(generalReferralLink("@my_bot", "1001"), "https://t.me/my_bot?start=ref_1001");
  assert.equal(parseGeneralReferral("ref_1001"), "1001");
  assert.equal(parseGeneralReferral("ref_1_2"), null);
  assert.equal(parseGeneralReferral("ref_x"), null);

  const joiner = { id: 2002, first_name: "New", last_name: "Member", username: "new_member" };
  const result = await registerGeneralReferral(joiner, "1001");
  assert.equal(result?.points, 5);
  assert.equal(await balanceOf("1001"), 5);
  assert.equal(await joinedCreditCount("1001"), 1);
  assert.equal((await recentReferrals(10)).filter((r) => r.joinerId === "2002").length, 1);

  assert.equal(await registerGeneralReferral(joiner, "1001"), null);
  assert.equal(await balanceOf("1001"), 5);
  assert.equal(await joinedCreditCount("1001"), 1);
  assert.equal((await recentReferrals(10)).filter((r) => r.joinerId === "2002").length, 1);
});

test("a referral-log storage failure is surfaced without leaving a permanent credited marker", async () => {
  const store = getStore();
  await store.set("user:3003", { id: "3003", firstName: "Inviter", username: "", joinedAt: 1 });
  const original = store.listPush.bind(store);
  store.listPush = async () => { throw new Error("temporary log outage"); };
  try {
    await assert.rejects(
      registerGeneralReferral({ id: 4004, first_name: "Retry" }, "3003"),
      /temporary log outage/,
    );
    assert.equal(await store.sHas("genref:credited", "4004"), false);
  } finally {
    store.listPush = original;
  }
  const result = await registerGeneralReferral({ id: 4004, first_name: "Retry" }, "3003");
  assert.equal(result?.joiner.id, "4004");
  assert.equal(await store.sHas("genref:credited", "4004"), true);
});
