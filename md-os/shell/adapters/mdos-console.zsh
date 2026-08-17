# MD-OS semantic extension for Zsh.

export MDOS_PARENT_SHELL=zsh
export MDOS_PARENT_PROMPT="${PROMPT-}"

command_not_found_handler() {
    emulate -L zsh
    local mdos_missing_command="${1-}"
    local mdos_executable=""

    if (( $# == 1 )) && [[ "$mdos_missing_command" == *[[:space:]]* ]]; then
        mdos_executable="${commands[mdos-console]-}"
        if [[ -z "$mdos_executable" || ! -x "$mdos_executable" ]]; then
            print -u2 -- 'zsh: MD-OS executable is unavailable in PATH'
            return 127
        fi

        "$mdos_executable" "$mdos_missing_command"
        return $?
    fi

    print -u2 -- "zsh: command not found: $mdos_missing_command"
    return 127
}
