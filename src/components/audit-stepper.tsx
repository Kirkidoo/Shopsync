'use client';

import { useState, useTransition, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Frown, Loader2, LogIn, Server, FileText, Database, Check, Clock, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from '@/lib/logger';

import {
  connectToFtp,
  listCsvFiles,
  runAudit,
  checkBulkCacheStatus,
  getCsvProducts,
  startBulkOperation,
  checkBulkOperationStatus,
  runBulkAuditFromCache,
  runBulkAuditFromDownload,
  getFtpCredentials,
  getAvailableLocations,
} from '@/app/actions';
import { AuditResult, DuplicateSku, Product } from '@/lib/types';
import AuditReport from '@/components/audit-report';
import { ActivityLogViewer } from '@/components/activity-log-viewer';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDistanceToNow } from 'date-fns';

import { Stepper, Step } from '@/components/ui/stepper';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileInfo {
  name: string;
  size: number;
  modifiedAt: string;
}

interface SavedSession {
  host: string;
  username: string;
  password: string;
  lastCsv: string;
  lastLocationId: string;
  savedAt: string;
}

const SESSION_KEY = 'shopsync_session';
const BULK_AUDIT_FILE = 'bulk_audit_request.jsonl';

function getSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(data: SavedSession) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { }
}

function clearSavedSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { }
}

const AUDIT_CACHE_KEY = 'shopsync_audit_cache';

interface AuditCache {
  report: AuditResult[];
  summary: any;
  duplicates: DuplicateSku[];
  fileName: string;
  cachedAt: string;
}

function getCachedAudit(): AuditCache | null {
  try {
    const raw = localStorage.getItem(AUDIT_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function cacheAudit(data: AuditCache) {
  try { localStorage.setItem(AUDIT_CACHE_KEY, JSON.stringify(data)); } catch { }
}

function clearAuditCache() {
  try { localStorage.removeItem(AUDIT_CACHE_KEY); } catch { }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ftpSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  port: z.coerce.number().default(21),
  secure: z.boolean().default(false),
});

type FtpFormData = z.infer<typeof ftpSchema>;

const defaultFtpCredentials: FtpFormData = {
  host: '',
  username: '',
  password: '',
  port: 21,
  secure: false,
};

const stepVariants = {
  initial: { opacity: 0, x: 20, scale: 0.95 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -20, scale: 0.95 },
};

type StepId = 'connect' | 'select' | 'auditing' | 'report' | 'error' | 'cache_check';

const STEPS: Step[] = [
  { id: 'connect', label: 'Connect' },
  { id: 'select', label: 'Select Data' },
  { id: 'cache_check', label: 'Method' },
  { id: 'auditing', label: 'Processing' },
  { id: 'report', label: 'Results' },
];

export default function AuditStepper() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialStep = (): StepId => {
    const urlStep = searchParams.get('step') as StepId | null;
    if (urlStep && ['connect', 'select', 'cache_check', 'auditing', 'report', 'error'].includes(urlStep)) {
      // Only restore to 'report' if we have cached data; otherwise start from connect
      if (urlStep === 'report' && getCachedAudit()) return 'report';
      if (urlStep === 'connect' || urlStep === 'select') return urlStep;
    }
    return 'connect';
  };

  const [step, setStepRaw] = useState<StepId>(initialStep);

  const setStep = useCallback((newStep: StepId) => {
    setStepRaw(newStep);
    const params = new URLSearchParams(searchParams.toString());
    params.set('step', newStep);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [csvFiles, setCsvFiles] = useState<FileInfo[]>([]);
  const [selectedCsv, setSelectedCsv] = useState<string>('');
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const [quickConnecting, setQuickConnecting] = useState(false);

  const [auditData, setAuditData] = useState<{
    report: AuditResult[];
    summary: any;
    duplicates: DuplicateSku[];
  } | null>(() => {
    // Restore cached audit if landing on report step
    if (initialStep() === 'report') {
      const cached = getCachedAudit();
      if (cached) {
        return { report: cached.report, summary: cached.summary, duplicates: cached.duplicates };
      }
    }
    return null;
  });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [cacheStatus, setCacheStatus] = useState<{ lastModified: string | null } | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const logEndRef = useRef<HTMLDivElement>(null);

  const ftpForm = useForm<FtpFormData>({
    resolver: zodResolver(ftpSchema),
    defaultValues: defaultFtpCredentials,
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'auditing') {
      const start = Date.now();
      setStartTime(start);
      setElapsedSeconds(0);
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      setStartTime(null);
      setElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [step]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityLog]);

  useEffect(() => {
    // Load saved session first (instant, from localStorage)
    const session = getSavedSession();
    if (session) {
      setSavedSession(session);
      ftpForm.reset({
        host: session.host,
        username: session.username,
        password: session.password,
        port: 21,
        secure: false,
      });
    }

    const fetchCredentials = async () => {
      try {
        const creds = await getFtpCredentials();
        logger.info('Fetched credentials from server:', {
          host: creds.host,
          username: creds.username,
          hasPassword: !!creds.password,
        });

        // Only override if no saved session AND form is still empty
        const currentValues = ftpForm.getValues();
        if (
          !session &&
          (creds.host || creds.username || creds.password) &&
          !currentValues.host &&
          !currentValues.username &&
          !currentValues.password
        ) {
          ftpForm.reset(creds);
        }
      } catch (error) {
        logger.error('Failed to fetch default credentials:', error);
      }
    };
    const fetchLocations = async () => {
      try {
        const locs = await getAvailableLocations();
        setLocations(locs);
        // Restore saved location or default to Gamma
        if (session?.lastLocationId) {
          setSelectedLocationId(session.lastLocationId);
        } else {
          const gamma = locs.find(l => l.id === 93998154045);
          if (gamma) setSelectedLocationId(gamma.id.toString());
          else if (locs.length > 0) setSelectedLocationId(locs[0].id.toString());
        }
      } catch (error) {
        logger.error('Failed to fetch locations:', error);
      }
    };
    fetchCredentials();
    fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = (values: FtpFormData) => {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append('host', values.host);
        formData.append('username', values.username);
        formData.append('password', values.password);

        await connectToFtp(formData);
        toast({ title: 'FTP Connection Successful', description: 'Ready to select a file.' });
        const files = await listCsvFiles(formData) as any as FileInfo[]; // Type assertion for safety if action type inference lags
        setCsvFiles(files);

        // Restore last CSV selection or default
        const session = getSavedSession();
        const lastCsv = session?.lastCsv;
        if (lastCsv && files.find(f => f.name === lastCsv)) {
          setSelectedCsv(lastCsv);
        } else if (files.length > 0) {
          setSelectedCsv(files.find(f => f.name === BULK_AUDIT_FILE)?.name ? BULK_AUDIT_FILE : files[0].name);
        }

        // Save credentials to session
        saveSession({
          host: values.host,
          username: values.username,
          password: values.password,
          lastCsv: selectedCsv || '',
          lastLocationId: selectedLocationId || '',
          savedAt: new Date().toISOString(),
        });
        setSavedSession(getSavedSession());

        setStep('select');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        setErrorMessage(message);
        setStep('error');
        ftpForm.setError('username', { type: 'manual', message });
      }
    });
  };

  const handleSelectChange = (value: string) => {
    setSelectedCsv(value);
    // Reset cache check when selection changes
    setCacheStatus(null);
  };

  const addLog = (message: string) => {
    setActivityLog((prev) => [...prev, message]);
  };

  const handleRunStandardAudit = () => {
    if (!selectedCsv) {
      toast({
        title: 'No File Selected',
        description: 'Please select a CSV file to start.',
        variant: 'destructive',
      });
      return;
    }
    setStep('auditing');
    setActivityLog([]);
    addLog('Starting standard audit...');

    startTransition(async () => {
      try {
        const values = ftpForm.getValues();
        const ftpData = new FormData();
        ftpData.append('host', values.host);
        ftpData.append('username', values.username);
        ftpData.append('password', values.password);

        addLog(`Downloading and parsing ${selectedCsv}...`);
        const locationId = selectedLocationId ? parseInt(selectedLocationId, 10) : undefined;
        const result = await runAudit(selectedCsv, ftpData, locationId);

        if (!result || !result.report || !result.summary || !result.duplicates) {
          throw new Error('An unexpected response was received from the server.');
        }

        addLog('Audit complete!');
        setAuditData(result);
        cacheAudit({ ...result, fileName: selectedCsv, cachedAt: new Date().toISOString() });
        setTimeout(() => setStep('report'), 500);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'An unexpected response was received from the server during the audit.';
        setErrorMessage(message);
        setStep('error');
      }
    });
  };

  const handleRunBulkAudit = (useCache: boolean) => {
    setStep('auditing');
    setActivityLog([]);

    startTransition(async () => {
      try {
        const values = ftpForm.getValues();
        const ftpData = new FormData();
        ftpData.append('host', values.host);
        ftpData.append('username', values.username);
        ftpData.append('password', values.password);

        addLog('Downloading CSV file from FTP...');
        const csvProducts = await getCsvProducts(selectedCsv, ftpData);
        if (!csvProducts) {
          throw new Error('Could not retrieve products from CSV file.');
        }
        addLog(`Found ${csvProducts.length} products in CSV.`);

        const locationId = selectedLocationId ? parseInt(selectedLocationId, 10) : undefined;
        let result;

        if (useCache) {
          addLog('Using cached Shopify data...');
          addLog('Running audit comparison on server...');
          result = await runBulkAuditFromCache(csvProducts, selectedCsv, locationId);
          if (!result) {
            addLog('Cache miss or error. Fetching fresh data...');
            useCache = false; // Force fetch
          }
        }

        if (!useCache) {
          addLog('Requesting new product export from Shopify...');
          let operation = await startBulkOperation();
          addLog(`Bulk operation started: ${operation.id}`);

          while (operation.status === 'RUNNING' || operation.status === 'CREATED') {
            addLog(`Waiting for Shopify... (Status: ${operation.status})`);
            await sleep(5000); // Poll every 5 seconds
            operation = await checkBulkOperationStatus(operation.id);
          }

          if (operation.status !== 'COMPLETED') {
            throw new Error(
              `Shopify bulk operation failed or was cancelled. Status: ${operation.status}`
            );
          }

          addLog('Shopify export completed.');

          if (!operation.resultUrl) {
            throw new Error(`Shopify bulk operation completed, but did not provide a result URL.`);
          }

          addLog('Downloading, parsing, and running audit on server...');
          result = await runBulkAuditFromDownload(csvProducts, selectedCsv, operation.resultUrl, locationId);
        }

        if (!result || !result.report || !result.summary || !result.duplicates) {
          throw new Error('An unexpected response was received from the server after bulk audit.');
        }

        addLog('Report finished!');
        setAuditData(result);
        cacheAudit({ ...result, fileName: selectedCsv, cachedAt: new Date().toISOString() });
        setTimeout(() => setStep('report'), 500);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'An unexpected response was received during the audit.';
        setErrorMessage(message);
        setStep('error');
      }
    });
  };

  const handleNextFromSelect = () => {
    if (selectedCsv) {
      // Update saved session with current selection
      const values = ftpForm.getValues();
      saveSession({
        host: values.host,
        username: values.username,
        password: values.password,
        lastCsv: selectedCsv,
        lastLocationId: selectedLocationId,
        savedAt: new Date().toISOString(),
      });
      setSavedSession(getSavedSession());

      setStep('cache_check');
      startTransition(async () => {
        const status = await checkBulkCacheStatus();
        setCacheStatus(status);
      });
    }
  };

  const handleQuickReaudit = () => {
    if (!savedSession) return;
    setQuickConnecting(true);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append('host', savedSession.host);
        formData.append('username', savedSession.username);
        formData.append('password', savedSession.password);

        await connectToFtp(formData);
        const files = await listCsvFiles(formData) as any as FileInfo[];
        setCsvFiles(files);

        const targetCsv = savedSession.lastCsv && files.find(f => f.name === savedSession.lastCsv)
          ? savedSession.lastCsv
          : files.find(f => f.name === BULK_AUDIT_FILE)?.name || files[0]?.name || '';
        setSelectedCsv(targetCsv);

        if (savedSession.lastLocationId) {
          setSelectedLocationId(savedSession.lastLocationId);
        }

        toast({ title: 'Connected!', description: `Ready to audit ${targetCsv}` });
        setStep('cache_check');
        const status = await checkBulkCacheStatus();
        setCacheStatus(status);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Quick connect failed.';
        toast({ title: 'Quick Connect Failed', description: message, variant: 'destructive' });
        clearSavedSession();
        setSavedSession(null);
      } finally {
        setQuickConnecting(false);
      }
    });
  };

  const handleReset = () => {
    setStep('connect');
    setActivityLog([]);
    setCsvFiles([]);
    setSelectedCsv('');
    setAuditData(null);
    clearAuditCache();
    setErrorMessage('');
    setCacheStatus(null);
    // Keep credentials filled from saved session instead of clearing
    const session = getSavedSession();
    if (session) {
      ftpForm.reset({ host: session.host, username: session.username, password: session.password, port: 21, secure: false });
    } else {
      ftpForm.reset(defaultFtpCredentials);
    }
  };

  const handleRefresh = () => {
    // Always go back to method selection for refresh to be safe, or just re-run the last method?
    // For simplicity, let's go back to cache_check which acts as the method selector now.
    setStep('cache_check');
    startTransition(async () => {
      const status = await checkBulkCacheStatus();
      setCacheStatus(status);
    });
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      {/* Visual Stepper */}
      <div className="mb-8">
        <Stepper steps={STEPS} currentStepId={step} />
      </div>

      <AnimatePresence mode="wait">
        {step === 'connect' && (
          <motion.div
            key="connect"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Quick Re-audit card for returning users */}
            {savedSession && (
              <Card className="mx-auto w-full max-w-md border-green-500/20 bg-green-500/5 shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                    <Zap className="h-4 w-4" />
                    Quick Re-audit
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Last session: <strong>{savedSession.lastCsv || 'No file selected'}</strong>
                    {' · '}
                    {formatDistanceToNow(new Date(savedSession.savedAt), { addSuffix: true })}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="flex gap-2 pt-0">
                  <Button
                    onClick={handleQuickReaudit}
                    disabled={isPending || quickConnecting}
                    className="flex-1"
                    size="sm"
                  >
                    {quickConnecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    Connect & Go
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { clearSavedSession(); setSavedSession(null); }}
                    className="text-muted-foreground"
                  >
                    Clear
                  </Button>
                </CardFooter>
              </Card>
            )}
            <Card className="mx-auto w-full max-w-md border-primary/10 shadow-2xl shadow-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Server className="h-5 w-5" />
                  FTP Server Connection
                </CardTitle>
                <CardDescription>
                  Enter your credentials to securely connect to the FTP server.
                </CardDescription>
              </CardHeader>
              <Form {...ftpForm}>
                <form onSubmit={ftpForm.handleSubmit(handleConnect)}>
                  <CardContent className="space-y-4">
                    <FormField
                      control={ftpForm.control}
                      name="host"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>FTP Host</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="ftp.your-domain.com"
                              {...field}
                              className="bg-background/50"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={ftpForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="your-username"
                              {...field}
                              className="bg-background/50"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={ftpForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} className="bg-background/50" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full" disabled={isPending}>
                      {isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <LogIn className="mr-2 h-4 w-4" />
                      )}
                      Connect
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            </Card>
          </motion.div>
        )}

        {step === 'select' && (
          <motion.div
            key="select"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
          >
            <Card className="mx-auto w-full max-w-xl border-primary/10 shadow-2xl shadow-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <FileText className="h-5 w-5" />
                  Select CSV File
                </CardTitle>
                <CardDescription>
                  Choose a file to audit. We&apos;ve found {csvFiles.length} files.
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid gap-3">
                  {csvFiles.map((file) => (
                    <button
                      key={file.name}
                      type="button"
                      onClick={() => handleSelectChange(file.name)}
                      aria-pressed={selectedCsv === file.name}
                      className={cn(
                        "relative flex w-full text-left cursor-pointer items-center gap-4 rounded-lg border p-4 transition-all hover:bg-accent/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selectedCsv === file.name
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full border",
                        selectedCsv === file.name ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"
                      )}>
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="font-medium leading-none">{file.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{(file.size / 1024).toFixed(1)} KB</span>
                          <span>•</span>
                          <span>{new Date(file.modifiedAt).toLocaleString()}</span>
                        </div>
                      </div>
                      {selectedCsv === file.name && (
                        <div className="absolute right-4 top-4">
                          <Check className="h-5 w-5 text-primary" />
                        </div>
                      )}
                    </button>
                  ))}
                  {csvFiles.length === 0 && (
                    <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed text-center text-muted-foreground">
                      <p>No CSV files found in the directory.</p>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-6">
                <Button variant="outline" onClick={() => setStep('connect')}>
                  Back
                </Button>
                <div className="border-t p-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="location-select">Filter by Shopify Location</Label>
                    <Select
                      value={selectedLocationId}
                      onValueChange={setSelectedLocationId}
                    >
                      <SelectTrigger id="location-select" className="w-full bg-background/50">
                        <SelectValue placeholder="Select a location..." />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id.toString()}>
                            {loc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Inventory will be filtered to check availability at this location only.
                    </p>
                  </div>
                </div>
                <Button onClick={handleNextFromSelect} disabled={isPending || !selectedCsv || !selectedLocationId}>
                  Next
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {step === 'cache_check' && (
          <motion.div
            key="cache_check"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
          >
            <Card className="mx-auto w-full max-w-2xl border-primary/10 shadow-2xl shadow-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Database className="h-5 w-5" />
                  Choose Audit Method
                </CardTitle>
                <CardDescription>
                  Select how you want to compare the CSV against Shopify.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isPending && !cacheStatus ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="mb-4 h-12 w-12 animate-spin text-primary" />
                    <p className="animate-pulse text-sm text-muted-foreground">
                      Checking for cached data...
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Option 1: Bulk / Cache */}
                    <div className="space-y-4 rounded-lg border p-4 transition-colors hover:bg-accent/5">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <Database className="h-4 w-4 text-blue-500" />
                        Bulk Audit (Recommended)
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Uses Shopify&apos;s Bulk API. Best for large files and 100% accuracy.
                        {cacheStatus?.lastModified ? (
                          <span className="mt-2 block font-medium text-green-600 dark:text-green-400">
                            Cache available from{' '}
                            {formatDistanceToNow(new Date(cacheStatus.lastModified), {
                              addSuffix: true,
                            })}
                            .
                          </span>
                        ) : (
                          <span className="mt-2 block font-medium text-orange-600 dark:text-orange-400">
                            No cache found. Will start a new export (takes time).
                          </span>
                        )}
                      </p>
                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={() => handleRunBulkAudit(true)}
                          disabled={isPending || !cacheStatus?.lastModified}
                          variant={cacheStatus?.lastModified ? 'default' : 'secondary'}
                          className="w-full"
                        >
                          Use Cached Data
                        </Button>
                        <Button
                          onClick={() => handleRunBulkAudit(false)}
                          disabled={isPending}
                          variant="outline"
                          className="w-full"
                        >
                          Start New Bulk Export
                        </Button>
                      </div>
                    </div>

                    {/* Option 2: Live Audit */}
                    <div className="space-y-4 rounded-lg border p-4 transition-colors hover:bg-accent/5">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <Server className="h-4 w-4 text-green-500" />
                        Live Audit
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Queries Shopify in real-time. Good for small files or quick checks.
                        <span className="mt-2 block text-muted-foreground">
                          Now includes verification step to prevent false positives.
                        </span>
                      </p>
                      <Button
                        onClick={handleRunStandardAudit}
                        disabled={isPending}
                        variant="secondary"
                        className="mt-auto w-full"
                      >
                        Run Live Audit
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-start">
                <Button variant="outline" onClick={() => setStep('select')}>
                  Back
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {step === 'auditing' && (
          <motion.div
            key="auditing"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
          >
            <Card className="mx-auto w-full max-w-lg border-primary/10 shadow-2xl shadow-primary/5">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl text-primary">Audit in Progress</CardTitle>
                <CardDescription>
                  Please wait while we process <strong>{selectedCsv}</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-2">
                {/* Visual Pulse */}
                <div className="flex flex-col items-center justify-center py-6">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl"></div>
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary/30 bg-background">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    </div>
                  </div>

                  <div className="mb-6 flex flex-col items-center gap-1">
                    <div className="text-3xl font-bold font-mono text-foreground">
                      {formatTime(elapsedSeconds)}
                    </div>
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">Time Elapsed</span>
                  </div>

                  <p className="animate-pulse text-sm font-medium text-muted-foreground">
                    {activityLog[activityLog.length - 1] || 'Initializing...'}
                  </p>
                </div>

                {/* Collapsible Logs */}
                <Collapsible
                  open={isLogOpen}
                  onOpenChange={setIsLogOpen}
                  className="w-full space-y-2"
                >
                  <div className="flex items-center justify-between px-4">
                    <h4 className="text-sm font-semibold text-muted-foreground">Detailed Activity Log</h4>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-9 p-0">
                        {isLogOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="sr-only">Toggle</span>
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="space-y-2">
                    <div className="max-h-60 overflow-y-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs">
                      <ul className="space-y-1">
                        {activityLog.map((log, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="mt-0.5 text-primary">›</span>
                            <span>{log}</span>
                          </li>
                        ))}
                        <div ref={logEndRef} />
                      </ul>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'report' && auditData && (
          <motion.div
            key="report"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <AuditReport
              data={auditData.report}
              summary={auditData.summary}
              duplicates={auditData.duplicates}
              fileName={selectedCsv}
              onReset={handleReset}
              onRefresh={handleRefresh}
            />
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div
            key="error"
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
          >
            <Card className="mx-auto w-full max-w-md border-destructive/20 shadow-2xl shadow-destructive/5">
              <CardContent className="pt-6">
                <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
                  <Frown className="h-4 w-4" />
                  <AlertTitle>An Error Occurred</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              </CardContent>
              <CardFooter>
                <Button onClick={handleReset} className="w-full" variant="destructive">
                  Start Over
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      <ActivityLogViewer />
    </div>
  );
}
