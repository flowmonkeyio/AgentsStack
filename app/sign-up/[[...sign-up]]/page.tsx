import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12 relative">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 orb orb-secondary opacity-15 animate-float" />
        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 orb orb-primary opacity-10 animate-float delay-200" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl font-bold text-foreground mb-2">Create your account</h1>
          <p className="text-foreground-muted">Start orchestrating AI agents today</p>
        </div>

        {/* Clerk SignUp component */}
        <SignUp
          appearance={{
            elements: {
              rootBox: "mx-auto w-full",
              card: "bg-background-card border border-border shadow-2xl rounded-2xl",
              headerTitle: "font-heading text-xl font-bold text-foreground",
              headerSubtitle: "text-foreground-muted",
              socialButtonsBlockButton: "bg-background border border-border hover:bg-background-card-hover text-foreground transition-colors",
              socialButtonsBlockButtonText: "font-medium",
              dividerLine: "bg-border",
              dividerText: "text-foreground-subtle",
              formFieldLabel: "text-foreground-muted text-sm font-medium",
              formFieldInput: "input-field",
              formButtonPrimary: "btn-primary w-full",
              footerActionLink: "text-primary hover:text-primary-hover font-medium",
              identityPreviewEditButton: "text-primary hover:text-primary-hover",
              formFieldAction: "text-primary hover:text-primary-hover text-sm",
              alertText: "text-destructive",
              formFieldInputShowPasswordButton: "text-foreground-muted hover:text-foreground",
            },
            layout: {
              socialButtonsPlacement: "bottom",
              socialButtonsVariant: "blockButton",
            },
          }}
        />
      </div>
    </div>
  );
}
