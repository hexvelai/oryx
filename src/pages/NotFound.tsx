import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center animate-fade-up">
        <h1 className="text-6xl font-display text-foreground">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">Page not found</p>
        <a href="/" className="mt-4 inline-flex text-sm text-primary hover:text-primary/80">
          Back to home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
