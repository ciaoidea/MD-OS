package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	chipperpb "github.com/digital-dream-labs/api/go/chipperpb"
	"github.com/digital-dream-labs/api/go/jdocspb"
	"github.com/digital-dream-labs/api/go/tokenpb"
	"github.com/golang-jwt/jwt"
	"github.com/google/uuid"
	"github.com/kercre123/zeroconf"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/peer"
)

type profile struct {
	Name      string `json:"name"`
	ESN       string `json:"esn"`
	Target    string `json:"target"`
	GUID      string `json:"guid"`
	TokenHash string `json:"token_hash"`
	Firmware  string `json:"firmware,omitempty"`
}

type pendingAuth struct {
	GUID      string
	TokenHash string
	Cert      []byte
}

type podServer struct {
	chipperpb.UnimplementedChipperGrpcServer
	tokenpb.UnimplementedTokenServer
	jdocspb.UnimplementedJdocsServer
	mu      sync.Mutex
	pending map[string]pendingAuth
	docs    map[string]map[string]*jdocspb.Jdoc
	path    string
}

type clientToken struct {
	Hash       string `json:"hash"`
	ClientName string `json:"client_name"`
	AppID      string `json:"app_id"`
	IssuedAt   string `json:"issued_at"`
}

func newPodServer() (*podServer, error) {
	dir, err := privateDataDir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	server := &podServer{
		pending: make(map[string]pendingAuth),
		docs:    make(map[string]map[string]*jdocspb.Jdoc),
		path:    filepath.Join(dir, "profile.json"),
	}
	if data, readErr := os.ReadFile(server.path); readErr == nil {
		var saved profile
		if jsonErr := json.Unmarshal(data, &saved); jsonErr != nil {
			return nil, fmt.Errorf("decode saved profile: %w", jsonErr)
		}
		if saved.ESN != "" && saved.TokenHash != "" {
			manager, marshalErr := json.Marshal(struct {
				ClientTokens []clientToken `json:"client_tokens"`
			}{ClientTokens: []clientToken{{Hash: saved.TokenHash, ClientName: "cortex", AppID: "SDK", IssuedAt: time.Now().Format(time.RFC3339Nano)}}})
			if marshalErr != nil {
				return nil, marshalErr
			}
			thing := "vic:" + saved.ESN
			server.docs[thing] = map[string]*jdocspb.Jdoc{
				"vic.AppTokens": {DocVersion: 1, FmtVersion: 1, ClientMetadata: "cortex-local-token", JsonDoc: string(manager)},
			}
			fmt.Printf("AUTH_RESTORED esn=%s profile=%s\n", saved.ESN, server.path)
		}
	} else if !os.IsNotExist(readErr) {
		return nil, readErr
	}
	return server, nil
}

func remoteIP(ctx context.Context) string {
	p, ok := peer.FromContext(ctx)
	if !ok {
		return ""
	}
	host, _, err := net.SplitHostPort(p.Addr.String())
	if err != nil {
		return strings.TrimSpace(strings.Split(p.Addr.String(), ":")[0])
	}
	return host
}

func makeClientToken() (string, string, error) {
	raw := make([]byte, 16)
	salt := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	if _, err := rand.Read(salt); err != nil {
		return "", "", err
	}
	salted := append(append([]byte{}, raw...), salt...)
	digest := sha256.Sum256(salted)
	hashed := append(digest[:], salt...)
	return base64.StdEncoding.EncodeToString(raw), base64.StdEncoding.EncodeToString(hashed), nil
}

func makeJWT() (string, error) {
	now := time.Now()
	t := jwt.NewWithClaims(jwt.SigningMethodRS512, jwt.MapClaims{
		"expires":      now.AddDate(0, 1, 0).Format(time.RFC3339Nano),
		"iat":          now.Format(time.RFC3339Nano),
		"permissions":  nil,
		"requestor_id": "vic:local",
		"token_id":     uuid.New().String(),
		"token_type":   "user+robot",
		"user_id":      "cortex",
	})
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		return "", err
	}
	return t.SignedString(key)
}

func (s *podServer) AssociatePrimaryUser(ctx context.Context, req *tokenpb.AssociatePrimaryUserRequest) (*tokenpb.AssociatePrimaryUserResponse, error) {
	guid, hash, err := makeClientToken()
	if err != nil {
		return nil, err
	}
	access, err := makeJWT()
	if err != nil {
		return nil, err
	}
	ip := remoteIP(ctx)
	s.mu.Lock()
	s.pending[ip] = pendingAuth{GUID: guid, TokenHash: hash, Cert: append([]byte{}, req.SessionCertificate...)}
	s.mu.Unlock()
	fmt.Printf("AUTH_PENDING ip=%s client=%q\n", ip, req.ClientName)
	return &tokenpb.AssociatePrimaryUserResponse{Data: &tokenpb.TokenBundle{Token: access, ClientToken: guid}}, nil
}

func (s *podServer) AssociateSecondaryClient(ctx context.Context, _ *tokenpb.AssociateSecondaryClientRequest) (*tokenpb.AssociateSecondaryClientResponse, error) {
	access, err := makeJWT()
	if err != nil {
		return nil, err
	}
	ip := remoteIP(ctx)
	s.mu.Lock()
	pending, ok := s.pending[ip]
	if !ok || pending.GUID == "" {
		guid, hash, tokenErr := makeClientToken()
		if tokenErr != nil {
			s.mu.Unlock()
			return nil, tokenErr
		}
		pending = pendingAuth{GUID: guid, TokenHash: hash}
		s.pending[ip] = pending
	}
	s.mu.Unlock()
	fmt.Printf("AUTH_PENDING_SECONDARY ip=%s\n", ip)
	return &tokenpb.AssociateSecondaryClientResponse{Data: &tokenpb.TokenBundle{Token: access, ClientToken: pending.GUID}}, nil
}

func (s *podServer) RefreshToken(ctx context.Context, _ *tokenpb.RefreshTokenRequest) (*tokenpb.RefreshTokenResponse, error) {
	access, err := makeJWT()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	pending := s.pending[remoteIP(ctx)]
	s.mu.Unlock()
	return &tokenpb.RefreshTokenResponse{Data: &tokenpb.TokenBundle{Token: access, ClientToken: pending.GUID}}, nil
}

func (s *podServer) ReadDocs(ctx context.Context, req *jdocspb.ReadDocsReq) (*jdocspb.ReadDocsResp, error) {
	ip := remoteIP(ctx)
	esn := strings.TrimPrefix(req.Thing, "vic:")
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.docs[req.Thing] == nil {
		s.docs[req.Thing] = make(map[string]*jdocspb.Jdoc)
	}
	if p, ok := s.pending[ip]; ok && esn != "" {
		manager, _ := json.Marshal(struct {
			ClientTokens []clientToken `json:"client_tokens"`
		}{ClientTokens: []clientToken{{Hash: p.TokenHash, ClientName: "cortex", AppID: "SDK", IssuedAt: time.Now().Format(time.RFC3339Nano)}}})
		s.docs[req.Thing]["vic.AppTokens"] = &jdocspb.Jdoc{DocVersion: 1, FmtVersion: 1, ClientMetadata: "cortex-local-token", JsonDoc: string(manager)}
		pr := profile{Name: "Vector", ESN: esn, Target: net.JoinHostPort(ip, "443"), GUID: p.GUID, TokenHash: p.TokenHash}
		encoded, _ := json.MarshalIndent(pr, "", "  ")
		if err := os.WriteFile(s.path, encoded, 0600); err != nil {
			return nil, err
		}
		fmt.Printf("AUTH_COMMITTED esn=%s ip=%s profile=%s\n", esn, ip, s.path)
	}
	resp := &jdocspb.ReadDocsResp{}
	for _, item := range req.Items {
		doc, ok := s.docs[req.Thing][item.DocName]
		if !ok {
			doc = &jdocspb.Jdoc{}
		}
		resp.Items = append(resp.Items, &jdocspb.ReadDocsResp_Item{Status: jdocspb.ReadDocsResp_CHANGED, Doc: doc})
	}
	return resp, nil
}

func (s *podServer) WriteDoc(_ context.Context, req *jdocspb.WriteDocReq) (*jdocspb.WriteDocResp, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.docs[req.Thing] == nil {
		s.docs[req.Thing] = make(map[string]*jdocspb.Jdoc)
	}
	doc := req.Doc
	if doc == nil {
		doc = &jdocspb.Jdoc{}
	}
	doc.DocVersion++
	s.docs[req.Thing][req.DocName] = doc
	return &jdocspb.WriteDocResp{Status: jdocspb.WriteDocResp_ACCEPTED, LatestDocVersion: doc.DocVersion}, nil
}

func outboundIP() (string, error) {
	probe := strings.TrimSpace(os.Getenv("CORTEX_VECTOR_ROUTE_PROBE"))
	if probe == "" {
		probe = "1.1.1.1:53"
	}
	conn, err := net.Dial("udp", probe)
	if err != nil {
		return "", err
	}
	defer conn.Close()
	host, _, err := net.SplitHostPort(conn.LocalAddr().String())
	return host, err
}

func interfaceForIP(ip string) (net.Interface, error) {
	interfaces, err := net.Interfaces()
	if err != nil {
		return net.Interface{}, err
	}
	for _, candidate := range interfaces {
		addresses, err := candidate.Addrs()
		if err != nil {
			continue
		}
		for _, address := range addresses {
			host, _, splitErr := net.ParseCIDR(address.String())
			if splitErr == nil && host.String() == ip {
				return candidate, nil
			}
		}
	}
	return net.Interface{}, fmt.Errorf("no network interface owns %s", ip)
}

func runPod() error {
	s, err := newPodServer()
	if err != nil {
		return err
	}
	certFile, keyFile, err := certificatePaths()
	if err != nil {
		return err
	}
	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp", ":443")
	if err != nil {
		return err
	}
	server := grpc.NewServer(
		grpc.Creds(credentials.NewTLS(&tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12})),
		grpc.UnaryInterceptor(func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
			fmt.Printf("GRPC_CALL method=%s ip=%s\n", info.FullMethod, remoteIP(ctx))
			resp, callErr := handler(ctx, req)
			if callErr != nil {
				fmt.Printf("GRPC_ERROR method=%s error=%q\n", info.FullMethod, callErr.Error())
			}
			return resp, callErr
		}),
		grpc.StreamInterceptor(func(srv any, stream grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
			fmt.Printf("GRPC_STREAM method=%s ip=%s\n", info.FullMethod, remoteIP(stream.Context()))
			callErr := handler(srv, stream)
			if callErr != nil {
				fmt.Printf("GRPC_STREAM_ERROR method=%s error=%q\n", info.FullMethod, callErr.Error())
			}
			return callErr
		}),
	)
	chipperpb.RegisterChipperGrpcServer(server, s)
	tokenpb.RegisterTokenServer(server, s)
	jdocspb.RegisterJdocsServer(server, s)
	compatListener, err := net.Listen("tcp", ":8084")
	if err != nil {
		listener.Close()
		return err
	}
	healthMux := http.NewServeMux()
	healthMux.HandleFunc("/ok", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	healthMux.HandleFunc("/ok:80", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	health := &http.Server{Addr: ":80", Handler: healthMux, ReadHeaderTimeout: 3 * time.Second}
	go func() {
		if serveErr := health.ListenAndServe(); serveErr != nil && serveErr != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "HEALTH_SERVER_ERROR: %v\n", serveErr)
		}
	}()
	ip, err := outboundIP()
	if err != nil {
		listener.Close()
		return err
	}
	mdns, err := zeroconf.RegisterProxy("escapepod", "_app-proto._tcp", "local.", 8084, "escapepod", []string{ip}, []string{"txtv=0", "lo=1", "la=2"}, nil)
	if err != nil {
		listener.Close()
		compatListener.Close()
		return err
	}
	defer mdns.Shutdown()
	go func() {
		if serveErr := server.Serve(compatListener); serveErr != nil {
			fmt.Fprintf(os.Stderr, "COMPAT_SERVER_ERROR: %v\n", serveErr)
		}
	}()
	fmt.Println("CORTEX_POD_READY grpc=escapepod.local:443,8084 health=http://escapepod.local/ok")
	return server.Serve(listener)
}
