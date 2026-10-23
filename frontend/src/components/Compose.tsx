import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { ArrowLeft, Paperclip, Clock, ChevronDown, Upload, X, Send, FileSpreadsheet, CheckCircle2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

interface ComposeProps {
  onClose: () => void;
  onSuccess: () => void;
  editEmail?: any; // The email object being edited
}

const Compose: React.FC<ComposeProps> = ({ onClose, onSuccess, editEmail }) => {
  const { token, user } = useAuth();
  const [emails, setEmails] = useState<string[]>(editEmail ? [editEmail.to] : []);
  const [emailInput, setEmailInput] = useState('');
  const [subject, setSubject] = useState(editEmail?.subject || '');
  const [body, setBody] = useState(editEmail?.body || '');
  const [delay, setDelay] = useState(editEmail?.delay?.toString() || '2000');
  const [hourlyLimit, setHourlyLimit] = useState(editEmail?.hourlyLimit?.toString() || '200');
  
  // CSV upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string>('');
  const [csvDetectedCount, setCsvDetectedCount] = useState<number>(0);
  
  // Format the date correctly for datetime-local input (defaults to now)
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const initialDate = editEmail?.scheduledAt ? new Date(editEmail.scheduledAt) : null;
  const formattedDate = initialDate 
    ? new Date(initialDate.getTime() - initialDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16) 
    : nowLocal;
  const [scheduledAt, setScheduledAt] = useState(formattedDate);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = (evt.target?.result as string) || '';
      setCsvData(text);

      try {
        // Send to backend parse-csv helper for robust parsing
        const res = await axios.post(
          `${API_URL}/api/emails/parse-csv`, 
          { csvData: text },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const count = res.data.count || 0;
        setCsvDetectedCount(count);
        toast.success(`Loaded ${count} valid recipient email(s) from ${file.name}`);
      } catch (err) {
        // Fallback local regex parsing
        const parsedEmails = text.split(/[\n,;]+/).map(item => item.trim()).filter(item => item.includes('@'));
        const uniqueCount = new Set(parsedEmails).size;
        setCsvDetectedCount(uniqueCount);
        toast.success(`Loaded ${uniqueCount} email(s) from ${file.name}`);
      }
    };
    reader.readAsText(file);
  };

  const handleRemoveCsv = () => {
    setCsvFile(null);
    setCsvData('');
    setCsvDetectedCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (emailInput.trim() && emailInput.includes('@')) {
        setEmails(prev => [...new Set([...prev, emailInput.trim()])]);
        setEmailInput('');
      }
    }
  };

  const removeEmail = (emailToRemove: string) => {
    setEmails(emails.filter(e => e !== emailToRemove));
  };

  const handleSubmit = async () => {
    const targetScheduledTime = scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString();

    const currentEmails = [...emails];
    if (emailInput.trim() && emailInput.includes('@')) {
      if (!currentEmails.includes(emailInput.trim())) {
        currentEmails.push(emailInput.trim());
      }
    }
    
    if (currentEmails.length === 0 && !csvData) {
      toast.error('Please add at least one recipient or upload a CSV file');
      return;
    }

    if (!subject.trim()) {
      toast.error('Please enter an email subject');
      return;
    }

    if (!body.trim()) {
      toast.error('Please enter email body content');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        subject,
        body,
        delay: parseInt(delay, 10) || 2000,
        hourlyLimit: parseInt(hourlyLimit, 10) || 200,
        scheduledAt: targetScheduledTime,
      };

      if (csvData) {
        payload.csvData = csvData;
      }
      if (currentEmails.length > 0) {
        payload.to = currentEmails;
      }

      if (editEmail) {
        // Edit mode (PUT)
        await axios.put(
          `${API_URL}/api/emails/${editEmail.id}`,
          { ...payload, to: currentEmails[0] || editEmail.to },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Email updated successfully');
      } else {
        // Create mode (POST)
        const res = await axios.post(
          `${API_URL}/api/emails/schedule`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success(`Successfully scheduled ${res.data.count || 'all'} email(s) (200/hr limit active)`);
      }
      
      onSuccess();
    } catch (error: any) {
      console.error('Submit error:', error);
      const msg = error.response?.data?.error || 'Failed to schedule emails';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const showToast = (feature: string) => {
    toast(`Feature '${feature}' activated`, { icon: '✨' });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col font-sans overflow-hidden bg-white animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="h-[72px] flex items-center justify-between px-8 border-b border-slate-200/60 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2.5 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">
            <ArrowLeft size={22} strokeWidth={2} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800">{editEmail ? 'Edit Scheduled Email' : 'Compose New Email Campaign'}</h2>
            <p className="text-xs text-slate-400">Automated queue with 200/hr rate limit and rescheduling</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="relative p-2.5 rounded-full text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors" onClick={() => showToast('Attach File')}>
            <Paperclip size={20} />
            <span className="absolute top-1.5 right-1.5 bg-emerald-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold border border-white">1</span>
          </button>
          <button className="p-2.5 rounded-full text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors" onClick={() => dateInputRef.current?.showPicker()} title="Pick Schedule Time">
            <Clock size={20} />
          </button>
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="ml-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-full text-sm font-bold shadow-lg shadow-emerald-500/30 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (editEmail ? 'Updating...' : 'Scheduling...') : (editEmail ? 'Update Email' : 'Schedule Batch')}
            <Send size={16} className={isSubmitting ? 'animate-bounce' : ''} />
          </button>
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-auto bg-slate-50">
        <div className="max-w-4xl mx-auto w-full py-8 px-10">
          
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 p-8 space-y-8">
            
            {/* From */}
            <div className="flex items-center gap-8">
              <label className="text-slate-400 text-sm w-16 shrink-0 font-bold uppercase tracking-wider">From</label>
              <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <span className="text-sm font-medium text-slate-700">{user?.email || 'reachinbox@domain.io'}</span>
                <ChevronDown size={16} className="text-slate-400" />
              </div>
            </div>

            {/* To & CSV Upload */}
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-8 relative">
                <label className="text-slate-400 text-sm w-16 shrink-0 font-bold uppercase tracking-wider mt-2.5">To</label>
                <div className="flex-1 flex flex-wrap items-center gap-2 border-b-2 border-slate-100 pb-3 focus-within:border-emerald-300 transition-colors min-h-[48px] pr-32">
                  {emails.map(email => (
                    <span key={email} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {email}
                      <button type="button" onClick={() => removeEmail(email)} className="text-emerald-500 hover:text-emerald-800 transition-colors focus:outline-none bg-emerald-100 rounded p-0.5"><X size={12} strokeWidth={3} /></button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={handleEmailKeyDown}
                    className="flex-1 min-w-[220px] outline-none text-sm font-medium text-slate-800 bg-transparent py-1.5"
                    placeholder={emails.length === 0 && !csvFile ? "Type an email and press Enter, or upload CSV..." : "Add another email..."}
                  />
                </div>
                
                <div className="absolute right-0 top-0 pt-2">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-emerald-600 flex items-center gap-2 text-sm font-bold hover:text-emerald-700 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-emerald-200 shadow-sm"
                  >
                    <Upload size={16} strokeWidth={2.5} /> Bulk CSV
                  </button>
                </div>
              </div>

              {/* Uploaded CSV Card */}
              {csvFile && (
                <div className="ml-24 flex items-center justify-between p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl animate-in fade-in duration-200">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                      <FileSpreadsheet size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        {csvFile.name}
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={12} /> {csvDetectedCount} recipients detected
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">{(csvFile.size / 1024).toFixed(1)} KB • CSV bulk schedule ready</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={handleRemoveCsv} 
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors"
                    title="Remove CSV"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="flex items-center gap-8">
              <label className="text-slate-400 text-sm w-16 shrink-0 font-bold uppercase tracking-wider">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 border-b-2 border-slate-100 pb-3 outline-none text-base font-semibold text-slate-800 placeholder-slate-300 focus:border-emerald-300 transition-colors"
                placeholder="What is this email about?"
              />
            </div>

            {/* Controls Row: Delay, Hourly Limit, Schedule Date */}
            <div className="flex items-center justify-between gap-6 pt-3 pb-4 bg-slate-50/80 -mx-8 px-8 border-y border-slate-200/60 flex-wrap">
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-700">Delay</label>
                <div className="relative">
                  <input
                    type="number"
                    value={delay}
                    onChange={(e) => setDelay(e.target.value)}
                    className="w-24 h-10 border border-slate-200 rounded-xl outline-none pl-3 pr-9 text-sm font-bold text-slate-800 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    placeholder="2000"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">ms</span>
                </div>
              </div>
              
              <div className="w-px h-8 bg-slate-200 hidden sm:block"></div>
              
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-700">Hourly Limit</label>
                <div className="relative">
                  <input
                    type="number"
                    value={hourlyLimit}
                    onChange={(e) => setHourlyLimit(e.target.value)}
                    className="w-24 h-10 border border-slate-200 rounded-xl outline-none px-3 text-center text-sm font-bold text-emerald-700 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    placeholder="200"
                  />
                  <span className="absolute right-2 top-2.5 text-[10px] font-bold text-emerald-600/60 pointer-events-none">/hr</span>
                </div>
              </div>
              
              <div className="w-px h-8 bg-slate-200 hidden sm:block"></div>
              
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-700">Start Time</label>
                <div className="relative">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    ref={dateInputRef}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="h-10 outline-none text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 hover:bg-emerald-100 transition-colors cursor-pointer shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Editor Box */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[320px] overflow-hidden focus-within:border-emerald-300 focus-within:shadow-md transition-all duration-300">
              <div className="p-6 flex-1">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full h-full bg-transparent border-none outline-none resize-none text-[15px] leading-relaxed text-slate-700 placeholder-slate-300 font-medium"
                  placeholder="Type your message here..."
                />
              </div>
              
              {/* Rich Text Toolbar Mock */}
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center gap-3 overflow-x-auto">
                <button className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors" onClick={() => showToast('Undo')}>↩</button>
                <button className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors" onClick={() => showToast('Redo')}>↪</button>
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                <button className="p-1.5 rounded-lg text-slate-600 font-serif font-bold hover:bg-slate-200 transition-colors" onClick={() => showToast('Text Format')}>Tt</button>
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                <button className="p-1.5 rounded-lg text-slate-700 font-black hover:bg-slate-200 transition-colors" onClick={() => showToast('Bold')}>B</button>
                <button className="p-1.5 rounded-lg text-slate-700 italic font-serif font-bold hover:bg-slate-200 transition-colors" onClick={() => showToast('Italic')}>I</button>
                <button className="p-1.5 rounded-lg text-slate-700 underline font-bold hover:bg-slate-200 transition-colors" onClick={() => showToast('Underline')}>U</button>
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                <button className="p-1.5 rounded-lg text-slate-500 font-bold hover:bg-slate-200 transition-colors" onClick={() => showToast('Align Left')}>≡</button>
                <button className="p-1.5 rounded-lg text-slate-500 font-bold hover:bg-slate-200 transition-colors" onClick={() => showToast('Align Center')}>↕</button>
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                <button className="p-1.5 rounded-lg text-slate-500 text-xs font-bold hover:bg-slate-200 transition-colors" onClick={() => showToast('List Numbers')}>1½</button>
                <button className="p-1.5 rounded-lg text-slate-500 text-xs font-bold hover:bg-slate-200 transition-colors" onClick={() => showToast('List Bullets')}>::</button>
                <div className="w-px h-5 bg-slate-300 mx-1"></div>
                <button className="p-1.5 rounded-lg text-slate-500 font-bold hover:bg-slate-200 transition-colors" onClick={() => showToast('Link')}>🔗</button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Compose;
