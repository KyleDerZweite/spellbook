"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/store/auth";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { login, getCurrentUser } from "@/lib/api/auth";

const formSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const { login: loginUser, setError, isLoading } = useAuthStore();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setError(null);
      console.log('🔐 Starting login process...');
      
      const authResponse = await login(values.username, values.password);
      console.log('✅ Login API success, received tokens');
      
      // Store token immediately and update Zustand store
      localStorage.setItem('access_token', authResponse.access_token);
      localStorage.setItem('refresh_token', authResponse.refresh_token);
      
      console.log('🔍 Fetching user profile...');
      const user = await getCurrentUser();
      console.log('✅ User profile fetched:', user.username);
      
      loginUser(authResponse, user);
      
      console.log('🚀 Redirecting to search...');
      router.push('/search');
    } catch (error: any) { 
      console.error('❌ Login failed:', error);
      const errorMessage = error.response?.data?.detail || "Invalid credentials";
      setError(errorMessage);
      toast({ title: "Login Failed", description: errorMessage, variant: "destructive" });
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-center mb-4">Login</h1>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Input {...form.register("username")} placeholder="Username" />
        <Input {...form.register("password")} type="password" placeholder="Password" />
        <Button type="submit" className="w-full">Login</Button>
      </form>
    </div>
  );
}
