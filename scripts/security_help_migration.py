from pathlib import Path

# Client PIN settings: 4..10 digits everywhere.
settings = Path('src/pages/client/Settings.tsx')
text = settings.read_text(encoding='utf-8')
text = text.replace("slice(0,6)", "slice(0,10)")
text = text.replace("Le PIN doit contenir 4 à 6 chiffres.", "Le PIN doit contenir entre 4 et 10 chiffres.")
text = text.replace("{hasPin?'Confirmez votre PIN actuel puis choisissez le nouveau.':'Entrez le nouveau PIN deux fois.'}</p>", "{hasPin?'Confirmez votre PIN actuel puis choisissez le nouveau.':'Entrez le nouveau PIN deux fois.'}</p><p className=\"mt-1 text-[11px] font-semibold text-slate-400\">PIN numérique : minimum 4 chiffres, maximum 10 chiffres.</p>")
text = text.replace('inputMode="numeric" type="password"', 'inputMode="numeric" minLength={4} maxLength={10} type="password"')
settings.write_text(text, encoding='utf-8')

# Global help shortcut + shared help route.
app = Path('src/App.tsx')
text = app.read_text(encoding='utf-8')
if "GlobalHelpButton" not in text:
    text = text.replace("import FirestoreNetworkBanner from'./components/FirestoreNetworkBanner';", "import FirestoreNetworkBanner from'./components/FirestoreNetworkBanner';import GlobalHelpButton from'./components/GlobalHelpButton';")
text = text.replace("return <BrowserRouter><FirestoreNetworkBanner/><Toaster position=\"top-center\"/><Routes>", "return <BrowserRouter><FirestoreNetworkBanner/><Toaster position=\"top-center\"/><GlobalHelpButton/><Routes>")
if '<Route path="/help" element={<ClientHelp/>}/>' not in text:
    text = text.replace('<Route path="/" element={<Home/>}/><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/pin" element={<PinScreen/>}/>', '<Route path="/" element={<Home/>}/><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/pin" element={<PinScreen/>}/><Route path="/help" element={<ClientHelp/>}/>')
app.write_text(text, encoding='utf-8')

print('Security, PIN and global help migration applied.')
