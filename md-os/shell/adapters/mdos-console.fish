# MD-OS semantic extension for Fish.

set -gx MDOS_PARENT_SHELL fish

function fish_command_not_found
    set -l mdos_missing_command $argv[1]

    if test (count $argv) -eq 1; and string match -rq '[[:space:]]' -- "$mdos_missing_command"
        set -l mdos_executable (command -s mdos-console)
        if test -z "$mdos_executable"
            printf 'fish: MD-OS executable is unavailable in PATH\n' >&2
            return 127
        end

        command "$mdos_executable" "$mdos_missing_command"
        return $status
    end

    if functions -q __fish_default_command_not_found_handler
        __fish_default_command_not_found_handler $argv
    else
        printf 'fish: Unknown command: %s\n' "$mdos_missing_command" >&2
    end
    return 127
end
