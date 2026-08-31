import React, { useState, useEffect, useMemo } from 'react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Checkbox } from './components/ui/checkbox';
import {
  apiSearchSchools,
  apiFetchOpportunities,
  apiUpsertSchoolOpportunity,
  apiDeleteSchoolOpportunity,
  apiFetchSchoolContacts,
  apiSendSchoolOutreach,
  apiFetchSchoolOutreachHistory,
  type School,
  type SchoolSearchResult,
  type Opportunity,
  type OutreachResult,
  type OutreachHistoryItem,
  type EvalProfile,
  SchoolContact
} from './api';
import { Loader2, Search, Building2, Globe, ExternalLink, Calculator, GraduationCap, Users, MapPin, BadgeCheck, Save, Check } from 'lucide-react';

const CIP_CODES = [
  { label: 'Computer Science', cip: '1107' },
  { label: 'Business Administration', cip: '5202' },
  { label: 'Accounting', cip: '5203' },
  { label: 'Nursing', cip: '5138' },
  { label: 'Teacher Education', cip: '1312' },
  { label: 'Engineering', cip: '1401' },
  { label: 'Law', cip: '2201' },
  { label: 'Psychology', cip: '4201' },
  { label: 'Biology', cip: '2601' },
  { label: 'Visual Arts', cip: '5007' },
];

const STATES = [
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'DC', label: 'District Of Columbia' },
  { value: 'FL', label: 'Florida' }, { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' }, { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' }, { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' }, { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' }, { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' }, { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' }, { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' }, { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' }, { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' }, { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' }, { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' }, { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' }, { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' }, { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }
];

interface Props {
  username?: string | null;
  profile: EvalProfile;
  t: (k: any) => string;
}

function getLocalOpportunities(username: string): Opportunity[] {
  const normUser = username.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(`ge_opps_${normUser}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalOpportunities(username: string, opps: Opportunity[]) {
  const normUser = username.trim().toLowerCase();
  try {
    localStorage.setItem(`ge_opps_${normUser}`, JSON.stringify(opps));
  } catch {}
}

function mergeOpportunities(local: Opportunity[], remote: Opportunity[]): Opportunity[] {
  const byId = new Map<string, Opportunity>();
  for (const o of local) byId.set(o.id, o);
  for (const o of remote) {
    const existing = byId.get(o.id);
    if (!existing || new Date(o.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      byId.set(o.id, o);
    }
  }
  return Array.from(byId.values());
}

type UIOutreachResult = OutreachResult | { schoolId: string; result: 'not_attempted' };

export function SchoolFinder({ username, profile, t }: Props) {
  const [cip, setCip] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [degreeFilter, setDegreeFilter] = useState<string>('');
  const [onlineFilter, setOnlineFilter] = useState<string>('');
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SchoolSearchResult | null>(null);
  const [searchError, setSearchError] = useState('');
  
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [history, setHistory] = useState<OutreachHistoryItem[]>([]);
  
  const [outreachSelected, setOutreachSelected] = useState<Set<string>>(new Set());
  const [contacts, setContacts] = useState<SchoolContact[]>([]);
  const [isFetchingContacts, setIsFetchingContacts] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [outreachConsent, setOutreachConsent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [outreachResults, setOutreachResults] = useState<UIOutreachResult[]>([]);
  const [requestId, setRequestId] = useState('');

  useEffect(() => {
    if (username) {
      const local = getLocalOpportunities(username);
      setOpportunities(local); // immediate load

      apiFetchOpportunities(username).then(async (res) => {
        if (res) {
          const remoteById = new Map(res.map(o => [o.id, o]));
          const merged = mergeOpportunities(local, res);
          setOpportunities(merged);
          setLocalOpportunities(username, merged);
          
          for (const o of merged) {
            if (o.kind === 'school') {
              const remote = remoteById.get(o.id);
              if (!remote || new Date(o.updatedAt).getTime() > new Date(remote.updatedAt).getTime()) {
                apiUpsertSchoolOpportunity(username, o).catch(() => {});
              }
            }
          }
        }
      }).catch(() => {});
      apiFetchSchoolOutreachHistory(username).then(res => {
        if (res) setHistory(res);
      }).catch(() => {});
    }
  }, [username]);

  const savedSchoolIds = useMemo(() => {
    return new Set(opportunities.filter(o => o.kind === 'school').map(o => o.id));
  }, [opportunities]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cip) return;
    
    setIsSearching(true);
    setSearchError('');
    setSearchResults(null);
    
    try {
      const results = await apiSearchSchools(cip, stateFilter, degreeFilter, onlineFilter, 0);
      setSearchResults(results);
    } catch (err: any) {
      if (err.message === 'setup_unavailable') {
        setSearchError(t('sfErrSetup'));
      } else if (err.message === 'source_unavailable') {
        setSearchError(t('sfErrSource'));
      } else {
        setSearchError(err.message || t('sfErrSearch'));
      }
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSave = async (school: School) => {
    if (!username) return;
    
    let updated: Opportunity[];
    const isCurrentlySaved = savedSchoolIds.has(school.id);

    let targetOpp: Opportunity | undefined;
    if (isCurrentlySaved) {
      updated = opportunities.filter(o => !(o.kind === 'school' && o.id === school.id));
    } else {
      targetOpp = {
        id: school.id,
        kind: 'school',
        title: school.name,
        organization: school.name,
        location: [school.city, school.state].filter(Boolean).join(', ') || t('sfNA'),
        url: school.website || undefined,
        sourceName: searchResults?.source.name,
        sourceUrl: searchResults?.source.url,
        sourceRetrievedAt: searchResults?.source.retrievedAt,
        status: 'saved',
        deadline: null,
        readinessChecks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      updated = [...opportunities, targetOpp];
    }
    
    const previous = [...opportunities];
    setOpportunities(updated);
    setSearchError('');
    setLocalOpportunities(username, updated);

    try {
      if (isCurrentlySaved) {
        await apiDeleteSchoolOpportunity(username, school.id);
      } else if (targetOpp) {
        await apiUpsertSchoolOpportunity(username, targetOpp);
      }
    } catch (err: any) {
      setOpportunities(previous);
      setLocalOpportunities(username, previous);
      if (err.message === 'setup_unavailable') {
        setSearchError(t('sfErrSetup'));
      } else if (err.message === 'source_unavailable') {
        setSearchError(t('sfErrSource'));
      } else {
        setSearchError(err.message || t('sfErrSync'));
      }
    }
  };

  const toggleOutreachSelect = (schoolId: string) => {
    setOutreachSelected(prev => {
      const next = new Set(prev);
      if (next.has(schoolId)) {
        next.delete(schoolId);
      } else if (next.size < 10) {
        next.add(schoolId);
      }
      return next;
    });
    setShowPreview(false);
    setOutreachResults([]);
    setRequestId(crypto.randomUUID());
  };

  const fetchContacts = async () => {
    if (!username || outreachSelected.size === 0) return;
    setIsFetchingContacts(true);
    try {
      const schoolIds = Array.from(outreachSelected);
      const res = await apiFetchSchoolContacts(username, schoolIds);
      setContacts(res);
      setShowPreview(true);
      if (!requestId) setRequestId(crypto.randomUUID());
    } catch (err: any) {
      if (err.message === 'setup_unavailable') {
        setSearchError(t('sfErrSetup'));
      } else if (err.message === 'source_unavailable') {
        setSearchError(t('sfErrSource'));
      } else {
        setSearchError(err.message || t('sfErrContacts'));
      }
    } finally {
      setIsFetchingContacts(false);
    }
  };

  const sendOutreach = async () => {
    if (!username || outreachSelected.size === 0 || !outreachConsent || !requestId) return;
    
    setIsSending(true);
    setSearchError('');
    try {
      const schoolsPayload = Array.from(outreachSelected).map(id => {
        const contact = contacts.find(c => c.schoolId === id);
        return {
          schoolId: id,
          email: (contact?.status === 'verified' && contact?.recipients?.[0]?.email) ? contact.recipients[0].email : ''
        };
      }).filter(s => s.email !== '');

      if (schoolsPayload.length === 0) {
        setSearchError(t('sfErrNoValidEmails'));
        setIsSending(false);
        return;
      }

      const results = await apiSendSchoolOutreach(username, requestId, schoolsPayload, true);
      
      const allResults: UIOutreachResult[] = Array.from(outreachSelected).map(id => {
        const found = results.find(r => r.schoolId === id);
        if (found) return found;
        return { schoolId: id, result: 'not_attempted' };
      });
      
      setOutreachResults(allResults);
      
      const newHistory = await apiFetchSchoolOutreachHistory(username);
      setHistory(newHistory);
      
      const updatedOpp = opportunities.map(opp => {
        if (opp.kind === 'school' && outreachSelected.has(opp.id)) {
          const res = results.find(r => r.schoolId === opp.id);
          if (res?.result === 'sent') {
            return { ...opp, status: 'researching' as const, updatedAt: new Date().toISOString() };
          }
        }
        return opp;
      });
      setOpportunities(updatedOpp);
      setLocalOpportunities(username, updatedOpp);
      
      for (const opp of updatedOpp) {
        if (opp.kind === 'school' && outreachSelected.has(opp.id)) {
           apiUpsertSchoolOpportunity(username, opp).catch(() => {});
        }
      }
      
    } catch (err: any) {
      if (err.message === 'setup_unavailable') {
        setSearchError(t('sfErrSetup'));
      } else if (err.message === 'source_unavailable') {
        setSearchError(t('sfErrSource'));
      } else {
        setSearchError(err.message || t('sfErrSend'));
      }
    } finally {
      setIsSending(false);
    }
  };

  if (profile.purpose !== 'University Admission') {
    return null;
  }

  const savedSchools = opportunities.filter(o => o.kind === 'school');
  const validContactsCount = contacts.filter(c => c.status === 'verified' && c.recipients && c.recipients.length > 0).length;

  return (
    <div className="mt-12 space-y-8" data-testid="container-schoolfinder">
      <div className="glass-panel rounded-xl p-6 sm:p-8 space-y-8 border-t border-t-white/10">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-2 text-white">
            {t('sfTitle')}
          </h3>
          <p className="text-slate-300 leading-relaxed max-w-3xl">
            {t('sfDesc')}
          </p>
        </div>

        <form onSubmit={handleSearch} className="space-y-6" data-testid="form-school-search">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-slate-200">{t('sfConfirmCip')}</Label>
              <p className="text-sm text-slate-400">{t('sfConfirmCipDesc')}</p>
              <Select value={cip} onValueChange={setCip}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700" data-testid="select-cip">
                  <SelectValue placeholder={t('sfPlaceholderCip')} />
                </SelectTrigger>
                <SelectContent>
                  {CIP_CODES.map(c => (
                    <SelectItem key={c.cip} value={c.cip}>
                      {t(`sfCip${c.cip}` as any) || `${c.label} (${c.cip})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-slate-200">{t('sfFilterState')}</Label>
              <p className="text-sm text-slate-400">{t('sfFilterStateOpt')}</p>
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700" data-testid="select-state">
                  <SelectValue placeholder={t('sfFilterNationwide')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('sfFilterNationwide')}</SelectItem>
                  {STATES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-slate-200">{t('sfFilterDegree')}</Label>
              <Select value={degreeFilter} onValueChange={setDegreeFilter}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700" data-testid="select-degree">
                  <SelectValue placeholder={t('sfFilterDegAny')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('sfFilterDegAny')}</SelectItem>
                  <SelectItem value="certificate">{t('sfFilterDegCert')}</SelectItem>
                  <SelectItem value="associate">{t('sfFilterDegAssoc')}</SelectItem>
                  <SelectItem value="bachelor">{t('sfFilterDegBach')}</SelectItem>
                  <SelectItem value="graduate">{t('sfFilterDegGrad')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-slate-200">{t('sfFilterOnline')}</Label>
              <Select value={onlineFilter} onValueChange={setOnlineFilter}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700" data-testid="select-online">
                  <SelectValue placeholder={t('sfFilterOnlineAny')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('sfFilterOnlineAny')}</SelectItem>
                  <SelectItem value="online">{t('sfFilterOnlineOnly')}</SelectItem>
                  <SelectItem value="campus">{t('sfFilterCampusOnly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={!cip || isSearching}
            className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="button-search-schools"
          >
            {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {isSearching ? t('sfSearching') : t('sfBtnSearch')}
          </Button>
        </form>

        {searchError && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm" data-testid="text-search-error">
            {searchError}
          </div>
        )}

        {searchResults && searchResults.schools.length === 0 && (
          <div className="p-8 text-center rounded-xl bg-slate-800/30 border border-slate-700" data-testid="text-search-empty">
            <Building2 className="h-10 w-10 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-300">{t('sfNoResults')}</p>
            {searchResults.source && (
              <p className="text-xs text-slate-500 mt-2">
                {t('sfSourceLabel')} <a href={searchResults.source.url} target="_blank" rel="noreferrer" className="underline">{searchResults.source.name}</a> 
                ({t('sfRetrievedLabel')} {new Date(searchResults.source.retrievedAt).toLocaleDateString()})
              </p>
            )}
          </div>
        )}

        {searchResults && searchResults.schools.length > 0 && (
          <div className="space-y-4" data-testid="list-search-results">
            <div className="text-sm text-slate-400 flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-blue-400" />
                {t('sfSourceNote')}
              </span>
              {searchResults.source && (
                <span className="text-xs">
                  <a href={searchResults.source.url} target="_blank" rel="noreferrer" className="underline hover:text-slate-300">
                    {searchResults.source.name}
                  </a> 
                  {' '}({t('sfRetrievedLabel')} {new Date(searchResults.source.retrievedAt).toLocaleDateString()})
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchResults.schools.map((school) => {
                const isSaved = savedSchoolIds.has(school.id);
                return (
                  <Card key={school.id} className="bg-slate-800/50 border-slate-700" data-testid={`card-school-${school.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <CardTitle className="text-lg text-white leading-tight">{school.name}</CardTitle>
                          <CardDescription className="flex items-center gap-1.5 mt-1 text-slate-400">
                            <MapPin className="h-3.5 w-3.5" />
                            {[school.city, school.state].filter(Boolean).join(', ') || t('sfNA')}
                          </CardDescription>
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          <div className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-xs font-medium border border-blue-500/20">
                            {t('sfPublic')}
                          </div>
                          {school.onlineOnly && (
                            <div className="bg-purple-500/10 text-purple-400 px-2 py-1 rounded text-xs font-medium border border-purple-500/20">
                              {t('sfOnline')}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3 text-sm space-y-2">
                      <div className="flex items-center gap-2 text-slate-300">
                        <GraduationCap className="h-4 w-4 text-slate-500" />
                        <span className="font-medium text-slate-200">{t('sfMatchedProgram')} {school.matchedCip || t('sfNA')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-300">
                        <Users className="h-4 w-4 text-slate-500" />
                        <span>{t('sfSize')} {school.studentSize ? school.studentSize.toLocaleString() : t('sfNA')}</span>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0 flex flex-wrap gap-2">
                      {school.website && (
                        <Button variant="outline" size="sm" className="h-8 bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700" asChild>
                          <a href={school.website.startsWith('http') ? school.website : `https://${school.website}`} target="_blank" rel="noopener noreferrer" data-testid={`link-school-${school.id}`}>
                            <Globe className="h-3.5 w-3.5 mr-1.5" /> {t('sfSite')}
                          </a>
                        </Button>
                      )}
                      {school.priceCalculator && (
                        <Button variant="outline" size="sm" className="h-8 bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700" asChild>
                          <a href={school.priceCalculator} target="_blank" rel="noopener noreferrer" data-testid={`link-calc-${school.id}`}>
                            <Calculator className="h-3.5 w-3.5 mr-1.5" /> {t('sfCalc')}
                          </a>
                        </Button>
                      )}
                      <div className="flex-grow" />
                      {username && (
                        <Button 
                          variant={isSaved ? "secondary" : "default"} 
                          size="sm" 
                          className={`h-8 ${isSaved ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30' : ''}`}
                          onClick={() => toggleSave(school)}
                          data-testid={`button-save-school-${school.id}`}
                        >
                          {isSaved ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                          {isSaved ? t('sfSaved') : t('sfSave')}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {username && savedSchools.length > 0 && (
        <div className="glass-panel rounded-xl p-6 sm:p-8 space-y-6 border-t border-t-white/10" data-testid="section-school-outreach">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-2 text-white">
              {t('sfOutreachTitle')}
            </h3>
            <p className="text-slate-300">
              {t('sfOutreachDesc')}
            </p>
          </div>

          <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-4">
            <h4 className="font-medium text-slate-200 mb-3 text-sm uppercase tracking-wider">{t('sfSavedSchools')}</h4>
            <div className="space-y-2">
              {savedSchools.map(school => {
                const isSelected = outreachSelected.has(school.id);
                const hasSent = history.some(h => h.schoolId === school.id && h.result === 'sent');
                return (
                  <div key={school.id} className="flex items-center justify-between p-3 rounded-md bg-slate-800/80 border border-slate-700">
                    <div className="flex items-center gap-3">
                      <Checkbox 
                        id={`outreach-${school.id}`} 
                        checked={isSelected}
                        disabled={hasSent || (outreachSelected.size >= 10 && !isSelected)}
                        onCheckedChange={() => toggleOutreachSelect(school.id)}
                        data-testid={`check-outreach-${school.id}`}
                      />
                      <label htmlFor={`outreach-${school.id}`} className="text-sm font-medium text-slate-200 cursor-pointer">
                        {school.organization}
                      </label>
                    </div>
                    {hasSent && <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded border border-emerald-500/20">{t('sfOutreachSent')}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {!showPreview && outreachSelected.size > 0 && (
            <Button 
              onClick={fetchContacts}
              disabled={isFetchingContacts}
              className="w-full sm:w-auto"
              data-testid="button-fetch-contacts"
            >
              {isFetchingContacts ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
              {t('sfPreviewOutreach')} ({outreachSelected.size})
            </Button>
          )}

          {showPreview && outreachSelected.size > 0 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-200">
                <p className="font-medium mb-1">{t('sfPreviewData')}</p>
                <ul className="list-disc pl-5 space-y-1 mt-2 opacity-80">
                  <li>{t('sfPackageCountry')} {profile.country || t('sfNA')}</li>
                  <li>{t('sfPackageInst')} {profile.institution || t('sfNA')}</li>
                  <li>{t('sfPackageDegree')} {profile.degree || t('sfNA')}</li>
                  <li>{t('sfPackageField')} {profile.field || t('sfNA')}</li>
                  <li>{t('sfPackagePurpose')} {profile.purpose || t('sfNA')}</li>
                </ul>
                <div className="mt-4 pt-3 mb-4 text-xs font-semibold bg-blue-500/20 text-blue-100 p-2 rounded border border-blue-500/30">
                  {t('sfOutreachDisclaimer')}
                </div>
                <div className="mt-4 space-y-2 border-t border-blue-500/20 pt-3">
                  <p className="font-medium">{t('sfVerifiedRecipients')}</p>
                  {contacts.map((c, i) => (
                    <div key={i} className="flex flex-col text-xs text-blue-300">
                      <span className="font-medium text-slate-200">
                        {c.schoolName || savedSchools.find(s => s.id === c.schoolId)?.organization || t('sfUnknownSchool')}
                      </span>
                      <span>
                        {c.status === 'verified' && c.recipients && c.recipients.length > 0 ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <BadgeCheck className="h-3 w-3" /> {c.recipients[0].email}
                            {c.recipients[0].sourceUrl && (
                              <a href={c.recipients[0].sourceUrl} target="_blank" rel="noreferrer" className="underline ml-2">Source</a>
                            )}
                          </span>
                        ) : c.status === 'fallback' && c.fallbackUrl ? (
                          <span className="text-amber-400 flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" /> {t('sfFormFallback')} 
                            <a href={c.fallbackUrl} target="_blank" rel="noreferrer" className="underline ml-1">{c.fallbackUrl}</a>
                          </span>
                        ) : (
                          <span className="text-destructive flex items-center gap-1">
                            {t('sfContactUnavailable')}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox 
                  id="consent" 
                  checked={outreachConsent}
                  onCheckedChange={(c) => setOutreachConsent(c === true)}
                  data-testid="check-outreach-consent"
                />
                <label htmlFor="consent" className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-300">
                  {t('sfOutreachConsent')}
                </label>
              </div>

              <Button 
                onClick={sendOutreach}
                disabled={!outreachConsent || isSending || validContactsCount === 0}
                className="w-full sm:w-auto"
                data-testid="button-send-outreach"
              >
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                {isSending ? t('sfSending') : t('sfBtnContact')} ({validContactsCount})
              </Button>
              <p className="text-xs text-slate-500 mt-2">{t('sfOutreachNote')}</p>
            </div>
          )}

          {outreachResults.length > 0 && (
            <div className="mt-4 space-y-2 p-4 rounded-lg bg-slate-900/50 border border-slate-800" data-testid="list-outreach-results">
              <h4 className="font-medium text-slate-200 mb-2 text-sm uppercase tracking-wider">{t('sfRecentInquiries')}</h4>
              {outreachResults.map((res, i) => {
                const schoolName = savedSchools.find(s => s.id === res.schoolId)?.organization || t('sfUnknownSchool');
                return (
                  <div key={i} className="text-sm flex justify-between p-2 rounded bg-slate-800/80 border border-slate-700">
                    <span className="text-slate-300">{schoolName}</span>
                    <span className={`font-medium ${res.result === 'sent' ? 'text-emerald-400' : res.result === 'failed' ? 'text-destructive' : 'text-slate-500'}`}>
                      {res.result === 'sent' ? t('sfOutreachSent') : res.result === 'failed' ? t('sfOutreachFailed') : t('sfOutreachUnattempted')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
