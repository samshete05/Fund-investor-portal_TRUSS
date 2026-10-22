import { useAuth, useSignIn, useSignUp } from '@clerk/react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { FiArrowLeft, FiCheckCircle, FiLock, FiMail, FiShield, FiUser, FiX } from 'react-icons/fi'
import './auth.css'

export type AuthMode = 'sign-in' | 'sign-up'
type Intent = 'invest' | 'sell' | ''
type SignupDetails = {
  firstName: string; lastName: string; email: string; password: string; confirmPassword: string; intent: Intent
  phone: string; residence: string; postalCode: string; referral: string; linkedIn: string
}
const initialDetails: SignupDetails = { firstName: '', lastName: '', email: '', password: '', confirmPassword: '', intent: '', phone: '', residence: '', postalCode: '', referral: '', linkedIn: '' }
const investorFields = [
  ['investorType', 'Are you investing as an individual or institution?', ['Individual', 'Institution']],
  ['investmentVehicle', 'How are you investing?', ['Individual', 'Personal investment vehicle (e.g. LLC)', 'Self-directed IRA', '401(k) plan', 'Revocable or living trust', 'Irrevocable trust', 'Other']],
  ['accreditedStatus', 'Please confirm your accredited investor status (self-reported)', ['Yes', 'No', 'Not sure']],
  ['qualifiedPurchaser', 'Qualified Purchaser status (self-reported)', ['Yes', 'No', 'Not sure']],
  ['investmentHorizon', 'Maximum investment horizon', ['Less than 3 years', '3â€“5 years', '5â€“10 years', 'More than 10 years']],
  ['riskComfort', 'Willingness to accept risk', ['Conservative', 'Moderate', 'Significant risk', 'Aggressive']],
  ['experience', 'Relevant investment experience', ['None', 'Less than 2 years', '2â€“5 years', 'More than 5 years']],
  ['liquidWorth', 'Immediate liquid worth', ['Less than $150,000', '$150,000â€“$250,000', '$250,000â€“$500,000', 'Greater than $500,000']],
] as const
type Intake = Record<string, string>
function clerkErrorMessage(error: { message?: string } | null | undefined) { return error?.message || 'We could not complete that request. Please try again.' }

export default function AuthModal({ initialMode, onClose }: { initialMode: AuthMode; onClose: () => void }) {
  const { getToken } = useAuth()
  const { signUp } = useSignUp()
  const { signIn } = useSignIn()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [details, setDetails] = useState(initialDetails)
  const [intake, setIntake] = useState<Intake>({})
  const [step, setStep] = useState<'account' | 'investor' | 'seller'>('account')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [code, setCode] = useState('')
  const [verificationFlow, setVerificationFlow] = useState<'signup' | 'mfa' | null>(null)
  const [signupFinalized, setSignupFinalized] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function updateDetail(field: keyof SignupDetails, value: string) { setDetails((current) => ({ ...current, [field]: value })) }
  function updateIntake(field: string, value: string) { setIntake((current) => ({ ...current, [field]: value })) }
  function switchMode(nextMode: AuthMode) { setMode(nextMode); setVerificationFlow(null); setError(''); setCode(''); setStep('account') }

  function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('')
    if (details.password !== details.confirmPassword) { setError('Your passwords do not match.'); return }
    if (!/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(details.password)) { setError('Use at least 8 characters, including an uppercase letter, a number, and a special character.'); return }
    if (!acceptedTerms) { setError('Please confirm your agreement before continuing.'); return }
    if (!details.intent) { setError('Choose whether you are looking to invest or sell.'); return }
    setStep(details.intent === 'invest' ? 'investor' : 'seller')
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!signUp) return
    setError('')
    const required = step === 'investor' ? investorFields.map(([key]) => key) : ['companyName', 'sharesOffered', 'sellerTitle']
    const missing = required.some((key) => !intake[key]?.trim())
    if (missing) { setError('Please complete all required fields.'); return }
    if (!acceptedTerms) { setError('Please confirm your agreement before continuing.'); return }
    setBusy(true)
    try {
      const createResult = await signUp.password({
        emailAddress: details.email.trim(), password: details.password, firstName: details.firstName.trim(), lastName: details.lastName.trim(), legalAccepted: true,
        unsafeMetadata: { applicationDetails: {
          intent: details.intent, phone: details.phone.trim(), countryOfResidence: details.residence, postalCode: details.postalCode.trim(),
          referralSource: details.referral, linkedInUrl: details.linkedIn.trim(), intake,
          notice: 'Self-reported demo application details. Not an eligibility determination or transaction.',
        } },
      })
      if (createResult.error) throw new Error(clerkErrorMessage(createResult.error))
      const emailResult = await signUp.verifications.sendEmailCode()
      if (emailResult.error) throw new Error(clerkErrorMessage(emailResult.error))
      setVerificationFlow('signup')
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Unable to start signup. Please try again.') }
    finally { setBusy(false) }
  }

  async function handleSignin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!signIn) return
    setError(''); setBusy(true)
    try {
      const result = await signIn.password({ emailAddress: loginEmail.trim(), password: loginPassword })
      if (result.error) throw new Error(clerkErrorMessage(result.error))
      if (signIn.status === 'complete') { const final = await signIn.finalize(); if (final.error) throw new Error(clerkErrorMessage(final.error)); onClose() }
      else if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
        const factor = signIn.supportedSecondFactors.find((item) => item.strategy === 'email_code')
        if (!factor) throw new Error('This account needs another verification method. Contact your portal administrator.')
        const sent = await signIn.mfa.sendEmailCode(); if (sent.error) throw new Error(clerkErrorMessage(sent.error)); setVerificationFlow('mfa')
      } else throw new Error('Your account needs an additional sign-in step. Contact your portal administrator.')
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Unable to sign in.') }
    finally { setBusy(false) }
  }
  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!signUp || !signIn || !verificationFlow) return
    setError(''); setBusy(true)
    try {
      if (verificationFlow === 'signup') {
        if (!signupFinalized) {
          const result = await signUp.verifications.verifyEmailCode({ code: code.trim() }); if (result.error) throw new Error(clerkErrorMessage(result.error))
          if (signUp.status !== 'complete') throw new Error('Email verified, but Clerk requires more profile information. Check required fields in your Clerk Dashboard.')
          const final = await signUp.finalize(); if (final.error) throw new Error(clerkErrorMessage(final.error))
          setSignupFinalized(true)
        }
        if (details.intent === 'invest') {
          const token = await getToken()
          const response = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/investor/application`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact: { phone: details.phone, countryOfResidence: details.residence, postalCode: details.postalCode, referralSource: details.referral, linkedInUrl: details.linkedIn }, answers: intake, privacyAccepted: acceptedTerms }),
          })
          const responseBody: { message?: string } = await response.json()
          if (!response.ok) throw new Error(responseBody.message ?? 'Your application could not be submitted. Try again.')
        }
      } else {
        const result = await signIn.mfa.verifyEmailCode({ code: code.trim() }); if (result.error) throw new Error(clerkErrorMessage(result.error))
        if (signIn.status !== 'complete') throw new Error('Verification is not complete yet. Check the code and try again.')
        const final = await signIn.finalize(); if (final.error) throw new Error(clerkErrorMessage(final.error))
      }
      onClose()
    } catch (verifyError) { setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify your email.') }
    finally { setBusy(false) }
  }
  async function resendCode() {
    if (!signUp || !signIn || !verificationFlow) return
    setBusy(true); setError('')
    try { const result = verificationFlow === 'signup' ? await signUp.verifications.sendEmailCode() : await signIn.mfa.sendEmailCode(); if (result.error) throw new Error(clerkErrorMessage(result.error)) }
    catch (resendError) { setError(resendError instanceof Error ? resendError.message : 'Unable to resend the code.') }
    finally { setBusy(false) }
  }

  const accountFields = <>
    <div className="auth-field-grid"><label className="auth-field"><span>First name <b>*</b></span><div className="auth-input-wrap"><FiUser /><input autoComplete="given-name" required value={details.firstName} onChange={(e) => updateDetail('firstName', e.target.value)} placeholder="First name" /></div></label><label className="auth-field"><span>Last name <b>*</b></span><div className="auth-input-wrap"><FiUser /><input autoComplete="family-name" required value={details.lastName} onChange={(e) => updateDetail('lastName', e.target.value)} placeholder="Last name" /></div></label></div>
    <label className="auth-field"><span>Email <b>*</b></span><div className="auth-input-wrap"><FiMail /><input autoComplete="email" type="email" required value={details.email} onChange={(e) => updateDetail('email', e.target.value)} placeholder="you@example.com" /></div></label>
    <div className="auth-field-grid"><label className="auth-field"><span>Password <b>*</b></span><div className="auth-input-wrap"><FiLock /><input autoComplete="new-password" type="password" minLength={8} required value={details.password} onChange={(e) => updateDetail('password', e.target.value)} placeholder="Create a password" /></div></label><label className="auth-field"><span>Confirm password <b>*</b></span><div className="auth-input-wrap"><FiLock /><input autoComplete="new-password" type="password" minLength={8} required value={details.confirmPassword} onChange={(e) => updateDetail('confirmPassword', e.target.value)} placeholder="Enter it again" /></div></label></div>
    <small className="auth-hint">At least 8 characters, with one uppercase letter, one number, and one special character.</small>
    <label className="auth-field"><span>Are you looking to invest or sell? <b>*</b></span><select required value={details.intent} onChange={(e) => updateDetail('intent', e.target.value as Intent)}><option value="">Choose an option</option><option value="invest">Invest</option><option value="sell">Sell</option></select></label>
    <label className="auth-field"><span>Phone number <b>*</b></span><div className="auth-input-wrap"><FiUser /><input autoComplete="tel" type="tel" required value={details.phone} onChange={(e) => updateDetail('phone', e.target.value)} placeholder="Include country code, e.g. +91 98765 43210" /></div><small>Profile contact information only; not used for SMS verification.</small></label>
    <div className="auth-field-grid country-grid"><label className="auth-field"><span>Country of residence</span><select value={details.residence} onChange={(e) => updateDetail('residence', e.target.value)}><option value="">Select country</option>{['India', 'United States', 'Canada', 'United Kingdom', 'Australia', 'Singapore', 'United Arab Emirates', 'Other'].map((x) => <option key={x}>{x}</option>)}</select></label><label className="auth-field"><span>Postal code <b>*</b></span><div className="auth-input-wrap"><input autoComplete="postal-code" required value={details.postalCode} onChange={(e) => updateDetail('postalCode', e.target.value)} placeholder="Postal code" /></div></label></div>
    <label className="auth-field"><span>How did you hear about us?</span><select value={details.referral} onChange={(e) => updateDetail('referral', e.target.value)}><option value="">Select an option</option>{[['search', 'Search Engine'], ['broker', 'E*TRADE or Morgan Stanley'], ['media', 'TV/Radio/Podcast'], ['social', 'Social Media'], ['coworker', 'Co-Worker'], ['friends', 'Friends/Family'], ['event', 'Event or Conference'], ['other', 'Other']].map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select></label>
    <label className="auth-field"><span>LinkedIn URL</span><div className="auth-input-wrap"><input autoComplete="url" type="url" value={details.linkedIn} onChange={(e) => updateDetail('linkedIn', e.target.value)} placeholder="https://www.linkedin.com/in/â€¦" /></div></label>
  </>

  return <div className="auth-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <section className={`auth-dialog ${mode === 'sign-up' && !verificationFlow ? 'auth-dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="auth-close" type="button" onClick={onClose} aria-label="Close dialog" disabled={busy}><FiX /></button><div className="auth-brand-mark"><FiShield /></div>
      {verificationFlow ? <div className="auth-content"><span className="auth-kicker">{signupFinalized ? 'APPLICATION SUBMISSION' : 'EMAIL VERIFICATION'}</span><h1 id="auth-title">{signupFinalized ? 'Finish your application' : 'Check your inbox'}</h1><p className="auth-intro">{signupFinalized ? 'Your email is verified. Submit your investor profile to create a pending application.' : <>We sent a verification code to <strong>{verificationFlow === 'signup' ? details.email : loginEmail}</strong>.</>}</p><form className="auth-form" onSubmit={handleVerify}>{!signupFinalized && <label className="auth-field"><span>Verification code</span><div className="auth-input-wrap"><FiMail /><input autoFocus autoComplete="one-time-code" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter your code" /></div></label>}{error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Submitting…' : signupFinalized ? 'Submit application' : 'Verify and continue'} <FiArrowLeft className="auth-submit-arrow" /></button></form>{!signupFinalized && <button className="auth-link-button resend-code" type="button" onClick={resendCode} disabled={busy}>Resend code</button>}<button className="auth-back" type="button" onClick={() => { setVerificationFlow(null); setError('') }}><FiArrowLeft /> Back to form</button></div>
      : mode === 'sign-up' ? <div className="auth-content auth-content-wide"><span className="auth-kicker">CREATE YOUR ACCOUNT</span><h1 id="auth-title">{step === 'account' ? 'Get started with Fundly' : step === 'investor' ? 'Investor profile' : 'Seller profile'}</h1><p className="auth-intro">{step === 'account' ? 'Tell us a little about yourself to get started.' : step === 'investor' ? 'Share your investing preferences. These answers are self-reported.' : 'Share details about your company and the shares you represent.'}</p>
        <div className="signup-progress" aria-label={`Signup step ${step === 'account' ? '1' : '2'} of 2`}><span className={step === 'account' ? 'current' : 'complete'}>1 <small>Account</small></span><i className={step !== 'account' ? 'complete' : ''}/><span className={step !== 'account' ? 'current' : ''}>2 <small>{details.intent === 'sell' ? 'Seller details' : 'Investor details'}</small></span></div>
        {step === 'account' ? <form className="auth-form signup-form" onSubmit={handleSignup}>{accountFields}<label className="auth-consent"><input type="checkbox" required checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} /><span>I have read and agree to the privacy notice and terms of use.</span></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" type="submit">Continue <FiArrowLeft className="auth-submit-arrow" /></button><div id="clerk-captcha"/></form>
        : <form className="auth-form signup-form" onSubmit={createAccount}>{step === 'investor' ? <><div className="intake-notice"><FiShield/><span>For demo profile purposes only. Responses are self-reported and are not verified or used to determine eligibility.</span></div>{investorFields.map(([key, label, choices]) => <label className="auth-field" key={key}><span>{label} <b>*</b></span><select required value={intake[key] ?? ''} onChange={(e) => updateIntake(key, e.target.value)}><option value="">Select an option</option>{choices.map((choice) => <option key={choice}>{choice}</option>)}</select></label>)}</> : <><div className="intake-notice"><FiShield/><span>Demo seller interest form only. This does not list or process a securities transaction, and does not grant administrator access.</span></div><label className="auth-field"><span>Company name <b>*</b></span><div className="auth-input-wrap"><FiUser/><input required value={intake.companyName ?? ''} onChange={(e) => updateIntake('companyName', e.target.value)} placeholder="Company or issuer name"/></div></label><div className="auth-field-grid"><label className="auth-field"><span>Shares offered <b>*</b></span><div className="auth-input-wrap"><input type="number" min="1" step="1" required value={intake.sharesOffered ?? ''} onChange={(e) => updateIntake('sharesOffered', e.target.value)} placeholder="Number of shares"/></div></label><label className="auth-field"><span>Share class</span><div className="auth-input-wrap"><input value={intake.shareClass ?? ''} onChange={(e) => updateIntake('shareClass', e.target.value)} placeholder="e.g. Common"/></div></label></div><div className="auth-field-grid"><label className="auth-field"><span>Company website</span><div className="auth-input-wrap"><input type="url" value={intake.companyWebsite ?? ''} onChange={(e) => updateIntake('companyWebsite', e.target.value)} placeholder="https://"/></div></label><label className="auth-field"><span>Your role at the company <b>*</b></span><div className="auth-input-wrap"><input required value={intake.sellerTitle ?? ''} onChange={(e) => updateIntake('sellerTitle', e.target.value)} placeholder="Founder, officer, representativeâ€¦"/></div></label></div><label className="auth-field"><span>Additional company or share details</span><textarea rows={3} value={intake.sellerNotes ?? ''} onChange={(e) => updateIntake('sellerNotes', e.target.value)} placeholder="Briefly describe the company and share details"/></label></>}
          <label className="auth-consent"><input type="checkbox" required checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)}/><span>I have read and agree to the privacy notice and terms of use.</span></label>{error && <p className="auth-error" role="alert">{error}</p>}<div className="signup-actions"><button className="auth-back" type="button" onClick={() => { setStep('account'); setError('') }}><FiArrowLeft/> Back</button><button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Creating accountâ€¦' : 'Create account'} <FiArrowLeft className="auth-submit-arrow"/></button></div><div id="clerk-captcha"/></form>}
        <p className="auth-switch">Already have an account? <button className="auth-link-button" type="button" onClick={() => switchMode('sign-in')}>Sign in</button></p></div>
      : <div className="auth-content"><span className="auth-kicker">WELCOME BACK</span><h1 id="auth-title">Sign in to Fundly</h1><p className="auth-intro">Use your email address and password to continue.</p><form className="auth-form" onSubmit={handleSignin}><label className="auth-field"><span>Email address</span><div className="auth-input-wrap"><FiMail/><input autoFocus autoComplete="email" type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@example.com"/></div></label><label className="auth-field"><span>Password</span><div className="auth-input-wrap"><FiLock/><input autoComplete="current-password" type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Your password"/></div></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Signing inâ€¦' : 'Sign in'} <FiArrowLeft className="auth-submit-arrow"/></button></form><div className="auth-secure-note"><FiCheckCircle/> Protected with Clerk authentication</div><p className="auth-switch">New to Fundly? <button className="auth-link-button" type="button" onClick={() => switchMode('sign-up')}>Create an account</button></p></div>}
    </section>
  </div>
}



