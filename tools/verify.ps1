[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Invoke-Checked {
    param(
        [Parameter(Mandatory)]
        [string]$Program,
        [string[]]$Arguments
    )

    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Program $($Arguments -join ' ')"
    }
}

Push-Location -LiteralPath $projectRoot
try {
    Invoke-Checked -Program 'node' -Arguments @('tools/verify.mjs')
    Invoke-Checked -Program 'npm' -Arguments @(
        'ci',
        '--offline',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund'
    )
    Invoke-Checked -Program 'node' -Arguments @('tools/clean.mjs')
    Invoke-Checked -Program 'tsc' -Arguments @(
        '--build',
        'tsconfig.json',
        '--pretty',
        'false'
    )
    Invoke-Checked -Program 'tsc' -Arguments @(
        '--build',
        'tsconfig.tests.json',
        '--pretty',
        'false'
    )
    Invoke-Checked -Program 'node' -Arguments @('tools/build-native.mjs')
    Invoke-Checked -Program 'node' -Arguments @(
        'tools/verify.mjs',
        '--require-generated'
    )
    Invoke-Checked -Program 'node' -Arguments @('tools/run-tests.mjs')
    Invoke-Checked -Program 'node' -Arguments @('tools/smoke-cli.mjs')

    Write-Host 'Verification passed: ownership, build, tests, and CLI smoke test.'
}
finally {
    Pop-Location
}
