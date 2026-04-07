import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { clearSessionCookie } from "~/lib/cookies.server";

export async function action(_: ActionFunctionArgs) {
  throw redirect("/admin/login", {
    headers: {
      "Set-Cookie": clearSessionCookie()
    }
  });
}
