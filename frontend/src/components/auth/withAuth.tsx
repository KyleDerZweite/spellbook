"use client";

import { useAuthStore } from "@/lib/store/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  const Wrapper = (props: P) => {
    const { isAuthenticated, isLoading } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        router.replace("/login");
      }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return null;
    }

    return <WrappedComponent {...props} />;
  };

  return Wrapper;
}
