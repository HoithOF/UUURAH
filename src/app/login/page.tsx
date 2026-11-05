import { AuthForm } from "@/components/AuthForm";
import { login } from "@/app/auth-actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="login" action={login} next={next} />;
}
