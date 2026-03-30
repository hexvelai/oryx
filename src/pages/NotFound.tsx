import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="gradient-bg-mesh flex min-h-screen items-center justify-center">
      <div className="text-center animate-fade-up">
        <h1 className="gradient-text text-7xl font-display">404</h1>
        <p className="mt-4 text-lg text-muted-foreground">Page not found</p>
        <a
          href="/"
          className="mt-6 inline-flex text-sm font-medium text-primary hover:text-primary/80"
        >
          Back to home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
