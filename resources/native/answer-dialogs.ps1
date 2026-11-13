# Répond aux boîtes de dialogue connues d'un émulateur.
# Entrées (variables d'environnement) :
#   CL_DIALOG_PID   : processus à surveiller
#   CL_DIALOG_RULES : JSON [{ "match": "<expression régulière>", "answer": "yes" | "no" | "ok" }]
# Une boîte de dialogue est une fenêtre visible du processus, possédée par une autre fenêtre.
# Si son texte correspond à une règle, le bouton voulu est actionné (jamais une simple touche Entrée :
# le bouton par défaut n'est pas toujours le bon). Chaque réponse est écrite sur la sortie standard.

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -Namespace ConsoleLauncher -Name Dialogs -MemberDefinition @'
public delegate bool EnumProc(IntPtr h, IntPtr l);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
[DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder sb, int n);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder sb, int n);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
/// Clique le bouton Win32 classique dont le texte correspond (BM_CLICK). Vrai si un bouton a ete trouve.
public static bool ClickChild(IntPtr dialog, string pattern) {
  bool clicked = false;
  var re = new System.Text.RegularExpressions.Regex(pattern, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
  EnumChildWindows(dialog, delegate (IntPtr h, IntPtr l) {
    var cls = new System.Text.StringBuilder(64); GetClassName(h, cls, 64);
    if (cls.ToString() != "Button") return true;
    var text = new System.Text.StringBuilder(128); GetWindowText(h, text, 128);
    if (!re.IsMatch(text.ToString())) return true;
    PostMessage(h, 0xF5, IntPtr.Zero, IntPtr.Zero);
    clicked = true;
    return false;
  }, IntPtr.Zero);
  return clicked;
}
public static IntPtr[] Find(uint target) {
  var found = new System.Collections.Generic.List<IntPtr>();
  EnumWindows(delegate (IntPtr h, IntPtr l) {
    uint pid; GetWindowThreadProcessId(h, out pid);
    if (pid == target && IsWindowVisible(h) && GetWindow(h, 4) != IntPtr.Zero) found.Add(h);
    return true;
  }, IntPtr.Zero);
  return found.ToArray();
}
'@

$target = [uint32]$env:CL_DIALOG_PID
$rules = @($env:CL_DIALOG_RULES | ConvertFrom-Json)
$buttons = @{
  yes = '^&?(yes|oui|ja|s[ií]|sim)$'
  no  = '^&?(no|non|nein|n[aã]o)$'
  ok  = '^&?(ok|d''accord)$'
}
$handled = @{}

while (Get-Process -Id $target) {
  foreach ($h in [ConsoleLauncher.Dialogs]::Find($target)) {
    if ($handled.ContainsKey($h)) { continue }
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($h)
    if (-not $root) { continue }
    $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $names = @($root.Current.Name)
    foreach ($el in $all) { $names += $el.Current.Name }
    $text = ($names -join ' ')
    foreach ($rule in $rules) {
      if ($text -notmatch $rule.match) { continue }
      $wanted = $buttons[[string]$rule.answer]
      $how = $null
      # 1. Bouton vu par l'accessibilite (interfaces Qt, WPF...) : on l'actionne directement.
      foreach ($el in $all) {
        if ($el.Current.ControlType.Id -ne [System.Windows.Automation.ControlType]::Button.Id) { continue }
        if ($el.Current.Name -notmatch $wanted) { continue }
        try {
          $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
          $how = 'accessibilite'
        } catch { }
        break
      }
      # 2. Repli : bouton Win32 classique de la boite.
      if (-not $how -and [ConsoleLauncher.Dialogs]::ClickChild($h, $wanted)) { $how = 'bouton Win32' }
      if ($how) {
        $handled[$h] = $true
        $short = $text.Substring(0, [Math]::Min(90, $text.Length))
        Write-Output ("reponse '" + $rule.answer + "' (" + $how + ") a : " + $short)
        break
      }
    }
  }
  Start-Sleep -Milliseconds 400
}
