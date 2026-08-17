# MD-OS semantic extension for PowerShell with PSReadLine.

$env:MDOS_PARENT_SHELL = 'powershell'

if (Get-Command Set-PSReadLineKeyHandler -ErrorAction SilentlyContinue) {
    Set-PSReadLineKeyHandler -Chord Enter -BriefDescription 'MDOSSemanticEnter' -ScriptBlock {
        param($key, $arg)

        $line = $null
        $cursor = $null
        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState(
            [ref]$line,
            [ref]$cursor
        )

        $trimmed = $line.Trim()
        $semanticInstruction = $null
        if ($trimmed.Length -ge 2) {
            $first = $trimmed[0]
            $last = $trimmed[$trimmed.Length - 1]
            $matchingQuotes = (
                ($first -eq [char]34 -and $last -eq [char]34) -or
                ($first -eq [char]39 -and $last -eq [char]39)
            )
            if ($matchingQuotes) {
                $candidate = $trimmed.Substring(1, $trimmed.Length - 2)
                if ($candidate -match '\s') {
                    $semanticInstruction = $candidate
                }
            }
        }

        if ($null -ne $semanticInstruction) {
            $escaped = $semanticInstruction.Replace("'", "''")
            [Microsoft.PowerShell.PSConsoleReadLine]::RevertLine()
            [Microsoft.PowerShell.PSConsoleReadLine]::Insert("mdos-console '$escaped'")
        }

        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
    }
}
