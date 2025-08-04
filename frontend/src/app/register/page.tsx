"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/store/auth";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { register, getCurrentUser } from "@/lib/api/auth";

const formSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export default function RegisterPage() {
  const { login, setError } = useAuthStore();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setError(null);
      const authResponse = await register(values.username, values.email, values.password);
      
      // Store token temporarily for getCurrentUser call
      localStorage.setItem('access_token', authResponse.access_token);
      
      const user = await getCurrentUser();
      login(authResponse, user);
      router.push('/search');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Could not create account";
      setError(errorMessage);
      toast({ title: "Registration Failed", description: errorMessage, variant: "destructive" });
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-center mb-4">Register</h1>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Input {...form.register("username")} placeholder="Username" />
        <Input {...form.register("email")} placeholder="Email" />
        <Input {...form.register("password")} type="password" placeholder="Password" />
        <Button type="submit" className="w-full">Register</Button>
      </form>
    </div>
  );
}
