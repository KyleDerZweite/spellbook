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
import { apiClient } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Clock, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const formSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export default function RegisterPage() {
  const { login, setError } = useAuthStore();
  const router = useRouter();
  const { toast } = useToast();
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<{username: string, email: string, needsApproval: boolean} | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setError(null);
      const response = await register(values.username, values.email, values.password);
      
      // Check if user needs approval (is_active = false)
      if (!response.is_active) {
        // User needs admin approval
        setRegisteredUser({
          username: values.username,
          email: values.email,
          needsApproval: true
        });
        setRegistrationSuccess(true);
        toast({ 
          title: "Registration Submitted", 
          description: "Your account is pending admin approval.", 
          variant: "default" 
        });
      } else {
        // User is immediately active - proceed with login by calling login API
        const authResponse = await apiClient.post('/auth/login', { 
          username: values.username, 
          password: values.password 
        });
        localStorage.setItem('access_token', authResponse.data.access_token);
        const user = await getCurrentUser();
        login(authResponse.data, user);
        router.push('/search');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Could not create account";
      setError(errorMessage);
      toast({ title: "Registration Failed", description: errorMessage, variant: "destructive" });
    }
  }

  // Show success message if registration is pending approval
  if (registrationSuccess && registeredUser?.needsApproval) {
    return (
      <div className="w-full max-w-md mx-auto">
        <Card>
          <CardHeader className="text-center">
            <Clock className="h-12 w-12 text-warning mx-auto mb-4" />
            <CardTitle>Registration Submitted</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Your account has been created and is pending admin approval.
            </p>
            <div className="bg-accent/50 p-4 rounded-lg">
              <p className="text-sm">
                <strong>Username:</strong> {registeredUser.username}<br />
                <strong>Email:</strong> {registeredUser.email}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              You'll be able to log in once an administrator approves your account.
            </p>
            <Link href="/login">
              <Button variant="outline" className="w-full">
                Back to Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-center mb-4">Register</h1>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Input {...form.register("username")} placeholder="Username" />
        <Input {...form.register("email")} placeholder="Email" />
        <Input {...form.register("password")} type="password" placeholder="Password" />
        <Button type="submit" className="w-full">
          <UserPlus className="h-4 w-4 mr-2" />
          Register
        </Button>
      </form>
      
      <div className="mt-6 text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
