# MD-OS semantic extension for Bash.
#
# A quoted natural-language sentence is parsed by Bash as one command name
# containing whitespace. If no executable has that name, Bash calls this
# function and the complete sentence is forwarded unchanged to MD-OS.

export MDOS_PARENT_SHELL=bash
export MDOS_PARENT_PS1="${PS1-}"

command_not_found_handle() {
    local mdos_missing_command="${1-}"
    local mdos_executable

    if (( $# == 1 )) && [[ "$mdos_missing_command" == *[[:space:]]* ]]; then
        mdos_executable="$(type -P mdos 2>/dev/null || true)"
        if [[ ! -x "$mdos_executable" ]]; then
            printf 'bash: MD-OS executable is unavailable in PATH\n' >&2
            return 127
        fi

        "$mdos_executable" "$mdos_missing_command"
        return $?
    fi

    printf 'bash: %s: command not found\n' "$mdos_missing_command" >&2
    return 127
}
