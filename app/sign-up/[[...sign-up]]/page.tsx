import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 relative overflow-hidden bg-[#f8f9fb]">
      {/* Premium background */}
      <div className="absolute inset-0">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(rgba(13, 148, 136, 0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(13, 148, 136, 0.04) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />
        {/* Gradient orbs - positioned for visual balance */}
        <div className="absolute -top-24 left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-[#0d9488]/10 to-transparent blur-3xl" />
        <div className="absolute -bottom-32 right-1/4 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-[#6366f1]/8 to-transparent blur-3xl" />
        <div className="absolute top-1/2 -right-24 w-[400px] h-[400px] rounded-full bg-gradient-to-br from-[#f59e0b]/6 to-transparent blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-[400px] animate-fade-up">
        {/* Logo & Header */}
        <div className="text-center mb-10">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #1a1d23 0%, #2d3340 100%)',
              boxShadow: '0 8px 32px -4px rgba(0, 0, 0, 0.25)',
            }}
          >
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="font-heading text-[28px] font-bold text-[#1a1d23] mb-3 tracking-tight">
            Create your account
          </h1>
          <p className="text-[#5c6370] text-[15px] leading-relaxed">
            Start orchestrating AI agents today
          </p>
        </div>

        {/* Clerk SignUp */}
        <div className="min-h-[440px]">
          <SignUp
            appearance={{
              elements: {
                rootBox: "mx-auto w-full",
                card: "clerk-card-premium",
                headerTitle: "font-heading text-xl font-bold text-[#1a1d23]",
                headerSubtitle: "text-[#5c6370] text-sm",
                socialButtonsBlockButton: "clerk-social-btn",
                socialButtonsBlockButtonText: "font-medium text-[#1a1d23]",
                socialButtonsBlockButtonArrow: "text-[#5c6370]",
                dividerLine: "bg-[#e5e7eb]",
                dividerText: "text-[#8b919e] text-sm",
                formFieldLabel: "text-[#5c6370] text-sm font-medium mb-1.5",
                formFieldInput: "clerk-input",
                formButtonPrimary: "clerk-btn-primary",
                footerAction: "",
                footerActionText: "text-[#5c6370] text-sm",
                footerActionLink: "text-[#0d9488] hover:text-[#0f766e] font-semibold ml-1",
                identityPreviewEditButton: "text-[#0d9488] hover:text-[#0f766e]",
                formFieldAction: "text-[#0d9488] hover:text-[#0f766e] text-sm font-medium",
                alertText: "text-[#dc2626]",
                formFieldInputShowPasswordButton: "text-[#5c6370] hover:text-[#1a1d23]",
                formFieldInputShowPasswordIcon: "w-4 h-4",
                internal: "hidden",
                footer: "clerk-footer",
              },
              layout: {
                socialButtonsPlacement: "bottom",
                socialButtonsVariant: "blockButton",
                showOptionalFields: false,
              },
            }}
          />
        </div>

        {/* Trust indicators */}
        <div className="mt-10 pt-6 border-t border-[#e5e7eb]/60">
          <div className="flex items-center justify-center gap-8">
            <div className="flex items-center gap-2 text-[#8b919e]">
              <div className="w-8 h-8 rounded-lg bg-[#f0f2f5] flex items-center justify-center">
                <svg className="w-4 h-4 text-[#5c6370]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <span className="text-xs font-medium">Secure</span>
            </div>
            <div className="flex items-center gap-2 text-[#8b919e]">
              <div className="w-8 h-8 rounded-lg bg-[#f0f2f5] flex items-center justify-center">
                <svg className="w-4 h-4 text-[#5c6370]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs font-medium">Free tier</span>
            </div>
            <div className="flex items-center gap-2 text-[#8b919e]">
              <div className="w-8 h-8 rounded-lg bg-[#f0f2f5] flex items-center justify-center">
                <svg className="w-4 h-4 text-[#5c6370]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xs font-medium">Instant</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
