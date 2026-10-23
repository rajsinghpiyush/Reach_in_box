import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import Compose from '../components/Compose';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { 
  Clock, Send, Search, Filter, RotateCw, Star, ChevronDown, 
  CheckCircle2, AlertCircle, Pencil, Trash2, ShieldAlert, Wifi, WifiOff 
} from 'lucide-react';
import { getSocket } from '../services/socket';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

interface Email {
  id: string;
  to: string;
  subject: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  from?: string | null;
  body: string;
  delay?: number;
  hourlyLimit?: number;
}

interface Stats {
  used: number;
  limit: number;
  remaining: number;
  scheduledCount: number;
  sentCount: number;
  failedCount: number;
}

const Dashboard = () => {
  const { user, logout, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEmail, setEditingEmail] = useState<Email | null>(null);
  const [viewingEmail, setViewingEmail] = useState<Email | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState<Stats>({
    used: 0,
    limit: 200,
    remaining: 200,
    scheduledCount: 0,
    sentCount: 0,
    failedCount: 0,
  });

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const [emailRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/api/emails/${activeTab}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/api/emails/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: null }))
      ]);

      setEmails(emailRes.data);
      if (statsRes?.data) {
        setStats(statsRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch emails', error);
      toast.error('Could not load emails');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, [activeTab, token]);

  // WebSocket real-time subscription
  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => {
      setIsConnected(true);
      if (user?.id) {
        socket.emit('join', user.id);
      }
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    if (socket.connected) {
      handleConnect();
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // 1. Real-time Email Scheduled event
    socket.on('email:scheduled', (incoming: Email[] | Email) => {
      const newItems = Array.isArray(incoming) ? incoming : [incoming];
      setEmails(prev => {
        if (activeTab === 'scheduled') {
          const map = new Map(prev.map(e => [e.id, e]));
          for (const item of newItems) {
            map.set(item.id, item);
          }
          return Array.from(map.values()).sort(
            (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
          );
        }
        return prev;
      });

      toast.success(
        `📅 ${newItems.length} email(s) scheduled in real time!`, 
        { id: 'sched-live', duration: 3000 }
      );
    });

    // 2. Real-time Email Sent event
    socket.on('email:sent', (sentEmail: Email) => {
      setEmails(prev => {
        if (activeTab === 'scheduled') {
          // Remove from scheduled tab as it's now sent
          return prev.filter(e => e.id !== sentEmail.id);
        } else if (activeTab === 'sent') {
          // Add to top of sent tab
          const filtered = prev.filter(e => e.id !== sentEmail.id);
          return [sentEmail, ...filtered];
        }
        return prev;
      });

      toast.success(`🚀 Email sent to ${sentEmail.to}`, {
        icon: '✉️',
        id: `sent-${sentEmail.id}`,
        duration: 3500,
      });
    });

    // 3. Real-time Email Rescheduled (rate limit triggered)
    socket.on('email:rescheduled', (rescheduledEmail: Email) => {
      setEmails(prev => {
        if (activeTab === 'scheduled') {
          return prev.map(e => e.id === rescheduledEmail.id ? rescheduledEmail : e);
        }
        return prev;
      });
    });

    // 4. Real-time 200 Hourly Limit Reached notification
    socket.on('rate-limit:reached', (data: { limit: number; count: number; to: string; nextHourTime: string }) => {
      toast.error(
        `⚠️ 200/hr limit reached (${data.count || 200}/${data.limit || 200})! Email to ${data.to} automatically rescheduled.`,
        { id: 'limit-reached-toast', duration: 5500 }
      );
    });

    // 5. Real-time Stats Updated
    socket.on('stats:updated', (updatedStats: Stats) => {
      setStats(prev => ({ ...prev, ...updatedStats }));
    });

    // 6. Real-time Email Deleted
    socket.on('email:deleted', (data: { id: string }) => {
      setEmails(prev => prev.filter(e => e.id !== data.id));
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('email:scheduled');
      socket.off('email:sent');
      socket.off('email:rescheduled');
      socket.off('rate-limit:reached');
      socket.off('stats:updated');
      socket.off('email:deleted');
    };
  }, [activeTab, user?.id]);

  const filteredEmails = emails.filter(email => 
    email.subject.toLowerCase().includes(searchQuery.toLowerCase()) || 
    email.to.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to cancel this scheduled email?')) return;
    try {
      await axios.delete(`${API_URL}/api/emails/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Email canceled successfully');
      setEmails(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      toast.error('Failed to cancel email');
    }
  };

  const handleEdit = (email: Email, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingEmail(email);
    setShowCompose(true);
  };

  if (showCompose) {
    return (
      <Compose 
        onClose={() => {
          setShowCompose(false);
          setEditingEmail(null);
        }} 
        onSuccess={() => {
          setShowCompose(false);
          setEditingEmail(null);
          fetchEmails();
        }} 
        editEmail={editingEmail}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex font-sans selection:bg-emerald-200">
      {/* Sidebar */}
      <div className="w-[280px] bg-white border-r border-slate-200/60 flex flex-col pt-8 pb-6 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
        <div className="px-8 mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-500/20 flex items-center justify-center">
              <span className="text-xl font-bold text-white tracking-tighter">O</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">ReachInbox</h1>
          </div>
        </div>

        <div className="px-6 mb-8">
          <div className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors group shadow-sm">
            <div className="flex items-center gap-3 overflow-hidden">
              {user?.picture ? (
                <img src={user.picture} alt="Avatar" className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-sm" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center text-emerald-700 font-bold text-sm ring-2 ring-white shadow-sm">
                  {user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-semibold truncate text-slate-800 group-hover:text-emerald-700 transition-colors">{user?.name || 'ReachInbox User'}</span>
                <span className="text-[11.5px] font-medium text-slate-500 truncate">{user?.email || 'user@reachinbox.ai'}</span>
              </div>
            </div>
            <div onClick={logout} className="p-1.5 rounded-full hover:bg-slate-200 transition-colors" title="Logout">
              <ChevronDown size={14} className="text-slate-400" />
            </div>
          </div>
        </div>

        <div className="px-6 mb-6">
          <button 
            onClick={() => setShowCompose(true)}
            className="w-full py-3.5 border-2 border-emerald-500 text-emerald-600 rounded-2xl text-sm font-bold hover:bg-emerald-50 hover:shadow-lg hover:shadow-emerald-500/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
          >
            <span>Compose Campaign</span>
          </button>
        </div>

        <div className="flex-1 px-4">
          <p className="text-[11px] font-bold text-slate-400 mb-4 px-4 uppercase tracking-widest">Navigation</p>
          <ul className="space-y-1.5">
            <li>
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`w-full flex justify-between items-center px-4 py-3 rounded-2xl text-sm transition-all duration-300 ${
                  activeTab === 'scheduled' 
                    ? 'bg-gradient-to-r from-emerald-50 to-teal-50/30 text-emerald-800 font-semibold shadow-sm border border-emerald-100/50' 
                    : 'text-slate-600 hover:bg-slate-50 font-medium border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${activeTab === 'scheduled' ? 'bg-emerald-100 text-emerald-600' : 'bg-transparent text-slate-400'}`}>
                    <Clock size={16} strokeWidth={2.5} /> 
                  </div>
                  Scheduled
                </div>
                {activeTab === 'scheduled' && <span className="text-[11px] font-bold text-emerald-600 bg-emerald-100/50 px-2.5 py-1 rounded-full">{emails.length}</span>}
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('sent')}
                className={`w-full flex justify-between items-center px-4 py-3 rounded-2xl text-sm transition-all duration-300 ${
                  activeTab === 'sent' 
                    ? 'bg-gradient-to-r from-emerald-50 to-teal-50/30 text-emerald-800 font-semibold shadow-sm border border-emerald-100/50' 
                    : 'text-slate-600 hover:bg-slate-50 font-medium border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${activeTab === 'sent' ? 'bg-emerald-100 text-emerald-600' : 'bg-transparent text-slate-400'}`}>
                    <Send size={16} strokeWidth={2.5} /> 
                  </div>
                  Sent
                </div>
                {activeTab === 'sent' && <span className="text-[11px] font-bold text-emerald-600 bg-emerald-100/50 px-2.5 py-1 rounded-full">{emails.length}</span>}
              </button>
            </li>
          </ul>
        </div>

        {/* 200 Hourly Limit Tracker Widget with Real-time Updates */}
        <div className="p-4 mx-4 mb-2 bg-slate-50 border border-slate-200/80 rounded-2xl shadow-sm">
          <div className="flex justify-between items-center mb-1.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Hourly Limit</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${stats.used >= stats.limit ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-emerald-100 text-emerald-800'}`}>
              {stats.used >= stats.limit ? '200 Limit Hit' : 'Healthy'}
            </span>
          </div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xl font-black text-slate-800">{stats.used} <span className="text-xs font-semibold text-slate-400">/ {stats.limit}</span></span>
            <span className="text-xs font-bold text-emerald-600">{Math.round((stats.used / (stats.limit || 200)) * 100)}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2 mb-2 overflow-hidden">
            <div 
              className={`h-2 rounded-full transition-all duration-700 ease-out ${stats.used >= stats.limit ? 'bg-amber-500' : 'bg-emerald-500'}`} 
              style={{ width: `${Math.min(100, (stats.used / (stats.limit || 200)) * 100)}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            {stats.used >= stats.limit 
              ? '⚠️ 200 limit reached. Excess emails are rescheduled to next hour.' 
              : `${stats.remaining} emails remaining in current hour window.`}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-0">
        {/* Header with Search and Real-time WebSocket Status */}
        <div className="h-24 bg-white/60 backdrop-blur-md border-b border-slate-200/60 flex items-center px-10 gap-6 sticky top-0 z-20">
          <div className="flex-1 flex items-center bg-white rounded-2xl px-5 py-3 max-w-3xl border border-slate-200 shadow-sm focus-within:shadow-md focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all duration-300">
            <Search size={18} className="text-slate-400 mr-3" />
            <input 
              type="text" 
              placeholder="Search by subject or recipient..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none flex-1 text-[15px] font-medium text-slate-700 placeholder-slate-400"
            />
          </div>

          {/* Real-time Connection Indicator */}
          <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors shadow-xs ${isConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
            {isConnected ? (
              <>
                <Wifi size={13} className="text-emerald-600 animate-pulse" />
                <span>Live Sync</span>
              </>
            ) : (
              <>
                <WifiOff size={13} className="text-slate-400" />
                <span>Connecting...</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-emerald-600 hover:border-emerald-200 hover:shadow-md transition-all active:scale-95" onClick={() => toast('Filter menu opened', { icon: '🔍' })}>
              <Filter size={18} />
            </button>
            <button className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-emerald-600 hover:border-emerald-200 hover:shadow-md transition-all active:scale-95 group" onClick={fetchEmails} title="Refresh">
              <RotateCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex flex-col justify-center items-center h-64 gap-4">
              <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin"></div>
              <p className="text-slate-500 font-medium">Fetching emails...</p>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-64">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Search size={24} className="text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium text-lg">No {activeTab} emails found.</p>
              {searchQuery && <p className="text-slate-400 text-sm mt-1">Try adjusting your search</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEmails.map((email) => (
                <div 
                  key={email.id} 
                  onClick={() => setViewingEmail(email)}
                  className="group flex items-center px-6 py-5 bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-200 cursor-pointer transition-all duration-300 hover:-translate-y-0.5"
                >
                  <div className="w-[22%]">
                    <p className="text-[14px] font-semibold text-slate-800 truncate pr-4">{email.to}</p>
                  </div>
                  
                  <div className="w-[24%] flex items-center">
                    {activeTab === 'scheduled' ? (
                      email.status === 'RESCHEDULED' ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 shadow-xs" title="Rescheduled due to 200/hr rate limit">
                          <ShieldAlert size={14} className="text-amber-600 animate-pulse" />
                          <span className="text-[11px] font-bold text-amber-800 tracking-tight">
                            Rescheduled: {format(new Date(email.scheduledAt), 'h:mm a')}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/60 shadow-xs">
                          <Clock size={14} className="text-emerald-600" />
                          <span className="text-[12px] font-bold text-emerald-800 tracking-wide">
                            {format(new Date(email.scheduledAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                      )
                    ) : (
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${email.status === 'FAILED' ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'} shadow-xs`}>
                        {email.status === 'FAILED' ? <AlertCircle size={14} className="text-red-600" /> : <CheckCircle2 size={14} className="text-emerald-600" />}
                        <span className={`text-[12px] font-bold tracking-wide ${email.status === 'FAILED' ? 'text-red-700' : 'text-emerald-700'}`}>
                          {email.status === 'FAILED' ? 'Failed' : 'Sent Successfully'}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 flex items-center text-[14px] overflow-hidden pr-4 ml-4">
                    <span className="font-bold text-slate-800 mr-3 truncate max-w-[220px]">
                      {email.subject}
                    </span>
                    <span className="text-slate-300 mx-1">|</span>
                    <span className="text-slate-500 font-medium truncate flex-1 ml-2">
                      {email.body?.replace(/<[^>]*>?/gm, '').split('[Ethereal Preview URL]:')[0]}
                    </span>
                    {email.body?.includes('[Ethereal Preview URL]:') && (
                      <a 
                        href={email.body.split('[Ethereal Preview URL]: ')[1]?.trim()} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="ml-4 px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Test Email
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {activeTab === 'scheduled' && (
                      <>
                        <button onClick={(e) => handleEdit(email, e)} className="p-2 rounded-full hover:bg-slate-100 hover:text-emerald-600 transition-colors" title="Edit">
                          <Pencil size={18} className="text-slate-400" />
                        </button>
                        <button onClick={(e) => handleDelete(email.id, e)} className="p-2 rounded-full hover:bg-red-50 hover:text-red-600 transition-colors" title="Cancel">
                          <Trash2 size={18} className="text-slate-400" />
                        </button>
                      </>
                    )}
                    <button className="p-2 rounded-full hover:bg-slate-100 transition-colors ml-1">
                      <Star size={18} className="text-slate-300 group-hover:text-amber-400 group-hover:fill-amber-400 transition-all duration-300" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* In-App Email Details & Preview Modal */}
      {viewingEmail && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setViewingEmail(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-6 border-b border-slate-100">
              <div>
                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  {viewingEmail.status}
                </span>
                <h3 className="text-xl font-black text-slate-800 mt-2">{viewingEmail.subject}</h3>
                <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-slate-500">
                  <span>To: <strong className="text-slate-700">{viewingEmail.to}</strong></span>
                  <span>•</span>
                  <span>From: <strong className="text-slate-700">{viewingEmail.from || user?.email || 'wanda.brekke@ethereal.email'}</strong></span>
                </div>
              </div>
              <button 
                onClick={() => setViewingEmail(null)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto py-6 my-4 bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Message Content</p>
              <div className="prose text-[14.5px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                {viewingEmail.body?.split('[Ethereal Preview URL]:')[0]}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{viewingEmail.sentAt ? `Sent at ${format(new Date(viewingEmail.sentAt), 'MMM d, yyyy h:mm a')}` : `Scheduled for ${format(new Date(viewingEmail.scheduledAt), 'MMM d, yyyy h:mm a')}`}</span>
              <div className="flex items-center gap-3">
                {viewingEmail.body?.includes('[Ethereal Preview URL]:') && (
                  <a
                    href={viewingEmail.body.split('[Ethereal Preview URL]: ')[1]?.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl font-bold hover:bg-indigo-100 transition-colors"
                  >
                    Open in Ethereal ↗
                  </a>
                )}
                <button
                  onClick={() => setViewingEmail(null)}
                  className="px-5 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
