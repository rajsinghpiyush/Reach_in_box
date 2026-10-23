import { GoogleLogin } from '@react-oauth/google';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { Mail, Lock, ArrowRight } from 'lucide-react';

const Login = () => {
  const { login, mockLogin, token } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isHovering, setIsHovering] = useState(false);

  if (token) {
    return <Navigate to="/" replace />;
  }

  const handleSuccess = async (credentialResponse: any) => {
    try {
      await login(credentialResponse.credential);
      toast.success('Successfully logged in!', { icon: '🎉' });
      navigate('/');
    } catch (error) {
      toast.error('Failed to log in with Google');
    }
  };

  const handleEmailLogin = () => {
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    mockLogin(email);
    toast.success('Welcome back!', { icon: '👋' });
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col justify-center font-sans relative overflow-hidden bg-slate-50">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-300/20 blur-[100px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-300/20 blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] rounded-full bg-teal-200/20 blur-[80px] animate-pulse" style={{ animationDelay: '4s' }}></div>

      <div className="mx-auto w-full max-w-md relative z-10">
        {/* Logo/Brand Area */}
        <div className="text-center mb-8 animate-fade-in-down">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 shadow-lg shadow-green-500/30 mb-4">
            <span className="text-2xl font-black text-white tracking-tighter">ONG</span>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">
            Welcome back
          </h2>
          <p className="text-slate-500 mt-2 font-medium">Sign in to orchestrate your emails</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/80 backdrop-blur-xl py-10 px-8 border border-white/50 rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] flex flex-col transform transition-all hover:shadow-[0_20px_40px_-15px_rgba(34,197,94,0.1)]">
          
          <div className="flex justify-center mb-6 w-full">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => toast.error('Login Failed')}
              size="large"
              width="350"
              type="standard"
              theme="outline"
              shape="rectangular"
            />
          </div>

          <div className="relative flex items-center justify-center my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <div className="relative bg-white/80 px-4 backdrop-blur-sm">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Or continue with</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              </div>
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 rounded-xl pl-11 pr-4 py-3.5 text-sm outline-none text-slate-800 placeholder-slate-400 transition-all font-medium"
              />
            </div>
            
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              </div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 rounded-xl pl-11 pr-4 py-3.5 text-sm outline-none text-slate-800 placeholder-slate-400 transition-all font-medium"
              />
            </div>

            <button 
              onClick={handleEmailLogin}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 shadow-lg shadow-emerald-500/25 transition-all duration-300 text-white font-semibold text-sm rounded-xl py-3.5 mt-4 flex items-center justify-center gap-2 group"
            >
              Sign In
              <ArrowRight size={18} className={`transition-transform duration-300 ${isHovering ? 'translate-x-1' : ''}`} />
            </button>
          </div>

        </div>
        
        <p className="text-center text-xs text-slate-400 mt-8 font-medium">
          By signing in, you agree to our Terms of Service & Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default Login;
