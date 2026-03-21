import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, MonitorSmartphone } from 'lucide-react';

interface SetupWizardProps {
  stream: MediaStream | null;
  zone: string;
  onComplete: () => void;
}

const SetupIllustration = () => (
  <svg viewBox="0 0 240 180" className="w-full h-full max-h-48 rounded-lg overflow-hidden" preserveAspectRatio="xMidYMid slice">
    <rect width="240" height="180" fill="#C8E6C9" />
    <path d="M 40 180 C 40 140, 60 130, 80 130 C 90 130, 100 120, 100 100 C 100 70, 80 50, 60 50 C 40 50, 30 70, 30 90 C 30 110, 40 120, 40 120 Z" fill="#1B5E20" />
    <path d="M 60 180 C 60 150, 80 140, 100 140 C 110 140, 115 130, 115 110 C 115 90, 100 70, 80 70 C 70 70, 60 80, 60 90 Z" fill="#388E3C" />
    <path d="M 110 95 L 125 100 L 110 110 Z" fill="#388E3C" />
    <circle cx="85" cy="90" r="4" fill="#1B5E20" />
    <path d="M 180 180 C 180 120, 150 120, 150 120" stroke="#1B5E20" strokeWidth="8" fill="none" strokeLinecap="round" />
    <rect x="140" y="80" width="12" height="50" rx="4" transform="rotate(-15 146 105)" fill="#81C784" stroke="#1B5E20" strokeWidth="3" />
  </svg>
);

export const SetupWizard: React.FC<SetupWizardProps> = ({ stream, zone, onComplete }) => {
  const [step, setStep] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, step]);

  const handleNext = () => {
    if (step === 0) setStep(1);
    else onComplete();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#121212] text-white flex flex-col font-sans">
      {/* Header */}
      <div className="h-12 bg-[#1e8e3e] w-full shrink-0"></div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {step === 0 ? (
            <motion.div
              key="step0"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="absolute inset-0 flex flex-col items-center p-6 sm:p-10 overflow-y-auto"
            >
              {/* Step 1 Instructions */}
              <div className="flex items-start gap-4 w-full max-w-md mb-8 shrink-0">
                <div className="w-8 h-8 rounded-full bg-[#1e8e3e] flex items-center justify-center font-bold shrink-0">1</div>
                <p className="text-lg sm:text-xl">Position the device so your head appears in this circle.</p>
              </div>

              {/* Circular Camera Feed */}
              <div className="w-64 h-64 sm:w-80 sm:h-80 rounded-full overflow-hidden border-2 border-zinc-500 bg-zinc-900 relative mb-12 shrink-0">
                {stream ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform scale-x-[-1]"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                    Camera starting...
                  </div>
                )}
              </div>

              <div className="w-full h-px bg-zinc-800 my-8 shrink-0"></div>

              {/* Step 2 Instructions */}
              <div className="flex items-start gap-4 w-full max-w-md mb-8 shrink-0">
                <div className="w-8 h-8 rounded-full bg-[#1e8e3e] flex items-center justify-center font-bold shrink-0">2</div>
                <p className="text-lg sm:text-xl">The device should be placed slightly below eye level. Ideally, it should be secured using a mount.</p>
              </div>

              {/* Illustration */}
              <div className="w-full max-w-sm mb-8 shrink-0">
                 <SetupIllustration />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="absolute inset-0 flex flex-col"
            >
              {/* Practice UI */}
              <div className="flex-1 relative flex flex-col items-center pt-24">
                {/* Top Pill */}
                <div className="bg-[#1e8e3e] border-4 border-white rounded-full px-8 py-4 flex items-center gap-8 z-10 shadow-lg">
                  <ArrowLeft className={`w-10 h-10 transition-all duration-300 ${zone === 'LEFT' ? 'text-white scale-125 drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'text-white/60'}`} />
                  <ArrowUp className={`w-10 h-10 transition-all duration-300 ${zone === 'UP' ? 'text-white scale-125 drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'text-white/60'}`} />
                  <ArrowRight className={`w-10 h-10 transition-all duration-300 ${zone === 'RIGHT' ? 'text-white scale-125 drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'text-white/60'}`} />
                </div>
                {/* Vertical Line */}
                <div className="w-2 bg-white flex-1 -mt-6"></div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="bg-[#1e8e3e] p-4 sm:p-6 flex flex-col items-center justify-between min-h-[140px] shrink-0">
         {step === 0 ? (
            <div className="flex items-center gap-2 mb-4 text-white font-medium">
              <MonitorSmartphone className="w-5 h-5" />
              <span>Setup helper</span>
            </div>
         ) : (
            <div className="flex items-center gap-2 mb-4 text-white font-medium">
              <CheckCircle2 className="w-5 h-5" />
              <span>Practice screen</span>
            </div>
         )}

         {step === 1 && (
           <p className="text-center text-white/90 mb-6 max-w-md text-sm sm:text-base">
             Practice looking left, right and up. Make sure you look off screen without moving your head.
           </p>
         )}

        <div className="flex items-center justify-between w-full max-w-4xl mt-auto">
          <button
            onClick={onComplete}
            className="text-white/80 hover:text-white font-bold tracking-wider px-4 py-2"
          >
            SKIP
          </button>

          <div className="flex gap-3">
            <div className={`w-2.5 h-2.5 rounded-full transition-colors ${step === 0 ? 'bg-white' : 'bg-white/30'}`} />
            <div className={`w-2.5 h-2.5 rounded-full transition-colors ${step === 1 ? 'bg-white' : 'bg-white/30'}`} />
          </div>

          <button
            onClick={handleNext}
            className="text-white font-bold tracking-wider px-4 py-2 flex items-center gap-2"
          >
            {step === 0 ? (
              <ArrowRight className="w-6 h-6" />
            ) : (
              'DONE'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
