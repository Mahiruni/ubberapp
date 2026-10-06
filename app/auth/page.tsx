import { redirect } from "next/navigation";

export default async function Authentication({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  redirect(params.recovery === "1" ? "/rider/reset-password" : "/rider/sign-in");
}
