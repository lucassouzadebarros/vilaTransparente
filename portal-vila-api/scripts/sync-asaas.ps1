param(
    [string]$ApiUrl = 'https://portal-vila-api.onrender.com/api',
    [string]$Email = 'ubaldinajacare207@gmail.com',
    [string]$From,
    [string]$To,
    [switch]$Apply
)

# Sincroniza o historico Pix do Asaas com o banco do portal.
# Sem -Apply roda em simulacao: mostra o que mudaria e nao grava nada.

$password = Read-Host "Senha do admin ($Email)" -AsSecureString
$plain = [System.Net.NetworkCredential]::new('', $password).Password

$login = Invoke-RestMethod -Method Post -Uri "$ApiUrl/auth/login" -ContentType 'application/json' `
    -Body (@{ email = $Email; password = $plain } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.token)" }

$query = @("apply=$($Apply.IsPresent.ToString().ToLower())")
if ($From) { $query += "from=$From" }
if ($To) { $query += "to=$To" }

if ($Apply) { Write-Host 'APLICANDO alteracoes no banco do portal...' -ForegroundColor Yellow }
else { Write-Host 'SIMULACAO (nada sera gravado). Use -Apply para gravar.' -ForegroundColor Cyan }

$report = Invoke-RestMethod -Method Post -Uri "$ApiUrl/admin/asaas/sync?$($query -join '&')" -Headers $headers -TimeoutSec 300

Write-Host ''
Write-Host "Periodo: $($report.from) a $($report.to) | pagamentos lidos no Asaas: $($report.paymentsFetched)"
Write-Host "Cobrancas criadas: $($report.chargesCreated) | atualizadas: $($report.chargesUpdated)"
Write-Host "Recebimentos diretos criados: $($report.directReceiptsCreated) | atualizados: $($report.directReceiptsUpdated)"
Write-Host "Sem mudanca: $($report.unchanged) | ignorados: $($report.ignored) | conflitos: $($report.conflicts) | pulados: $($report.skipped) | falhas: $($report.failed)"
Write-Host ''
Write-Host ("Saldo do portal antes : {0:N2}" -f $report.localBalanceBefore)
Write-Host ("Saldo do portal depois: {0:N2}" -f $report.localBalanceAfter)
if ($null -ne $report.asaasBalance) {
    Write-Host ("Saldo no Asaas        : {0:N2}" -f $report.asaasBalance)
    Write-Host ("Diferenca (Asaas - portal): {0:N2}" -f $report.difference)
}
Write-Host ("Extrato no periodo: entradas {0:N2} | taxas {1:N2} | outras saidas {2:N2}" -f $report.statementCredits, $report.statementFees, $report.statementOtherDebits)

if ($report.items.Count -gt 0) {
    Write-Host ''; Write-Host 'Itens:' -ForegroundColor Green
    $report.items | Format-Table action, paymentId, remoteStatus, value, date, note -AutoSize
}
if ($report.debits.Count -gt 0) {
    Write-Host 'Saidas no extrato do Asaas (confira se existem como despesa no portal):' -ForegroundColor Yellow
    $report.debits | Format-Table date, type, value, description -AutoSize
}
if ($report.creditsWithoutLocalRecord.Count -gt 0) {
    Write-Host 'Entradas no extrato SEM registro no portal:' -ForegroundColor Red
    $report.creditsWithoutLocalRecord | Format-Table date, type, value, description -AutoSize
}
foreach ($warning in $report.warnings) { Write-Host "AVISO: $warning" -ForegroundColor Yellow }
