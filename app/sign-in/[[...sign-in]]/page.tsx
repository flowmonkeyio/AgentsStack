import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
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
            Welcome back
          </h1>
          <p className="text-[#5c6370] text-[15px] leading-relaxed">
            Sign in to continue to AgentStack
          </p>
        </div>

        {/* Clerk SignIn */}
        <div className="min-h-[380px]">
          <SignIn
            appearance={{
              variables: {
                colorPrimary: "#0d9488",
                colorText: "#1a1d23",
                colorTextSecondary: "#5c6370",
                colorInputBackground: "#f8fafc",
                colorInputText: "#1a1d23",
                colorBackground: "#ffffff",
                borderRadius: "0.75rem",
                fontFamily: "DM Sans, system-ui, sans-serif",
              },
              elements: {
                rootBox: "mx-auto w-full",
                card: "bg-white shadow-lg rounded-2xl border border-gray-100 p-6",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton: "hidden",
                dividerRow: "hidden",
                formFieldLabel: "text-gray-600 text-sm font-semibold mb-2",
                formFieldInput: {
                  backgroundColor: "#f8fafc",
                  border: "2px solid #e2e8f0",
                  borderRadius: "10px",
                  padding: "14px 16px",
                  fontSize: "15px",
                  color: "#1e293b",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                  "&:hover": {
                    borderColor: "#cbd5e1",
                  },
                  "&:focus": {
                    borderColor: "#0d9488",
                    boxShadow: "0 0 0 3px rgba(13, 148, 136, 0.15)",
                  },
                },
                formButtonPrimary: {
                  background: "linear-gradient(135deg, #0d9488 0%, #0891b2 100%)",
                  borderRadius: "10px",
                  padding: "14px 24px",
                  fontSize: "15px",
                  fontWeight: "600",
                  boxShadow: "0 2px 8px rgba(13, 148, 136, 0.25)",
                  "&:hover": {
                    transform: "translateY(-1px)",
                    boxShadow: "0 4px 12px rgba(13, 148, 136, 0.35)",
                  },
                },
                footerAction: "mt-4 pt-4 border-t border-gray-100",
                footerActionText: "text-gray-500 text-sm",
                footerActionLink: "text-teal-600 hover:text-teal-700 font-semibold ml-1",
                formFieldAction: "text-teal-600 hover:text-teal-700 text-sm font-medium",
                footer: "opacity-60 mt-4",
              },
              layout: {
                socialButtonsPlacement: "bottom",
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="text-xs font-medium">Encrypted</span>
            </div>
            <div className="flex items-center gap-2 text-[#8b919e]">
              <div className="w-8 h-8 rounded-lg bg-[#f0f2f5] flex items-center justify-center">
                <svg className="w-4 h-4 text-[#5c6370]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-xs font-medium">Fast</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
